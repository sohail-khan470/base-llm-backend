const {
  generateEmbedding,
  storeEmbedding,
} = require("../services/embeddingService");
const { generateQA } = require("../services/llmService");
const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js");
const mammoth = require("mammoth");
const { Readable } = require("stream");

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = require("pdfjs-dist/legacy/build/pdf.worker.entry.js");

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB limit

async function processPDFInStream(buffer, chunkCallback) {
  try {
    const loadingTask = pdfjsLib.getDocument({ data: buffer });
    const pdf = await loadingTask.promise;
    let fullText = "";

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item) => item.str).join(" ");
      fullText += pageText + "\n";

      // Process page by page to avoid memory buildup
      if (fullText.length >= 1000) {
        await chunkCallback(fullText);
        fullText = "";
      }
    }

    // Process any remaining text
    if (fullText.length > 0) {
      await chunkCallback(fullText);
    }
  } catch (error) {
    console.error("PDF processing error:", error);
    throw error;
  }
}

async function processTextInStream(text, chunkCallback) {
  const chunkSize = 1000;
  let currentChunk = "";

  for (let i = 0; i < text.length; i++) {
    currentChunk += text[i];

    if (currentChunk.length >= chunkSize) {
      await chunkCallback(currentChunk);
      currentChunk = "";

      // Add small delay to allow garbage collection
      if (i % 10000 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
  }

  if (currentChunk.length > 0) {
    await chunkCallback(currentChunk);
  }
}

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

    // Ensure we have text to process
    if (!extractedText || extractedText.trim() === "") {
      return res.status(400).json({ error: "No text content found in file" });
    }

    // Get chunks and ensure it's an array
    let chunks = splitTextIntoChunks(extractedText, 1200, 200);

    // SAFETY CHECK: Ensure chunks is always an array
    if (!Array.isArray(chunks)) {
      console.warn("splitTextIntoChunks did not return array, using fallback");
      chunks = [extractedText]; // Fallback to single chunk
    }

    // Filter out empty chunks
    chunks = chunks.filter((chunk) => chunk && chunk.trim().length > 0);

    if (chunks.length === 0) {
      return res.status(400).json({ error: "No valid text chunks created" });
    }

    console.log(`Processing ${chunks.length} chunks`);

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

        // Add small delay to prevent memory issues
        if (i % 5 === 0) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      } catch (err) {
        console.error("Error storing chunk", i, err.message || err);
      }
    }

    // Optionally create a single QA for the entire file
    let qa = {};
    try {
      // Use slice safely - ensure chunks is array first
      const fileContext = Array.isArray(chunks)
        ? chunks.slice(0, 10).join("\n\n")
        : extractedText;
      qa = await generateQA(fileContext || extractedText || "");

      if (qa && qa.question && qa.answer) {
        const qaText = `Question: ${qa.question}\nAnswer: ${qa.answer}`;
        const qaEmb = await generateEmbedding(qaText);
        if (qaEmb) {
          await storeEmbedding(uuidv4(), qaText, qaEmb, {
            type: "file_qa",
            filename: file.name,
          });
        }
      }
    } catch (qaError) {
      console.error("QA generation failed:", qaError.message);
      qa = { error: "QA generation failed" };
    }

    res.json({
      message: "File processed",
      fileName: file.name,
      chunksStored: storedChunks.length,
      totalChunks: chunks.length,
      qa,
    });
  } catch (err) {
    console.error("uploadFile error:", err.message || err);
    res.status(500).json({ error: "Failed to process file" });
  }
}

module.exports = { uploadFile };
