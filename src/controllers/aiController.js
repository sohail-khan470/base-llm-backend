const { streamAIResponse, generateQA } = require("../services/llmService");
const {
  generateEmbedding,
  storeEmbedding,
  queryContext,
  queryContextByEmbedding,
} = require("../services/embeddingService");
const { splitTextIntoChunks } = require("../utils/textSplitter");
const { v4: uuidv4 } = require("uuid");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");

/**
 * /api/ai/chat (POST)
 * body: { prompt }
 * Streams response to client (chunked plain text).
 * Uses RAG: retrieved context is injected before generating.
 */
async function chatWithAIStream(req, res) {
  try {
    const { prompt } = req.body;
    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "prompt required" });
    }

    res.setHeader("Content-Type", "text/plain; charset=utf-8");

    const abortController = new AbortController();
    req.on("close", () => {
      abortController.abort();
    });

    const onData = (token) => {
      try {
        res.write(token);
      } catch (err) {
        console.error("res.write error:", err.message || err);
      }
    };

    const onDone = async (fullResponse) => {
      if (!res.writableEnded) res.end();
    };

    await streamAIResponse(prompt, onData, onDone, abortController.signal);
  } catch (err) {
    console.error("chatWithAIStream error:", err.message || err);
    if (!res.headersSent)
      res.status(500).json({ error: "Internal server error" });
    else if (!res.writableEnded) res.end();
  }
}

/**
 * /api/ai/upload (POST) -> file upload under field name 'file'
 * - extracts text
 * - chunks text
 * - generates embeddings per chunk and stores them with metadata
 * - optionally generates QA per file (one) and stores it
 */
async function uploadFile(req, res) {
  try {
    if (!req.files || !req.files.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }
    const file = req.files.file;
    const mimetype = file.mimetype;

    let extractedText = "";
    if (mimetype === "application/pdf") {
      const pdf = await pdfParse(file.data);
      extractedText = pdf.text || "";
    } else if (
      mimetype ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      const mm = await mammoth.extractRawText({ buffer: file.data });
      extractedText = mm.value || "";
    } else if (mimetype === "text/plain") {
      extractedText = file.data.toString("utf8");
    } else {
      return res.status(400).json({ error: "Unsupported file type" });
    }

    const chunks = splitTextIntoChunks(extractedText, 1200, 200);
    // store each chunk with chunk metadata
    const storedChunks = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      try {
        const emb = await generateEmbedding(chunk);
        if (!emb) {
          console.warn("Skipping chunk embedding due to null embedding", i);
          continue;
        }
        const id = uuidv4();
        await storeEmbedding(id, chunk, emb, {
          type: "file_chunk",
          filename: file.name,
          chunkIndex: i,
        });
        storedChunks.push({ id, index: i });
      } catch (err) {
        console.error("Error storing chunk", i, err.message || err);
      }
    }

    // Optionally create a single QA for the entire file (this is optional and may be noisy)
    const fileContext = chunks.slice(0, 10).join("\n\n"); // limit context used for QA to first N chunks
    const qa = await generateQA(fileContext || extractedText || ""); // generateQA comes from llmService
    if (qa.question && qa.answer) {
      const qaText = `Question: ${qa.question}\nAnswer: ${qa.answer}`;
      const qaEmb = await generateEmbedding(qaText);
      if (qaEmb) {
        await storeEmbedding(uuidv4(), qaText, qaEmb, {
          type: "file_qa",
          filename: file.name,
        });
      }
    }

    res.json({
      message: "File processed",
      fileName: file.name,
      chunksStored: storedChunks.length,
      qa,
    });
  } catch (err) {
    console.error("uploadFile error:", err.message || err);
    res.status(500).json({ error: "Failed to process file" });
  }
}

module.exports = { chatWithAIStream, uploadFile };
