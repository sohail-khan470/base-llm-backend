// controllers/chatController.js - FIXED VERSION
const { streamAIResponse, generateQA } = require("../services/llmService");
const {
  generateEmbedding,
  storeEmbedding,
  queryContext,
  queryContextByEmbedding,
} = require("../services/embeddingService");
const { splitTextIntoChunks } = require("../utils/textSplitter");
const { v4: uuidv4 } = require("uuid");
//const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js");
const mammoth = require("mammoth");
const pdf = require("pdf-parse");

// Configure PDF.js worker
//pdfjsLib.GlobalWorkerOptions.workerSrc = require("pdfjs-dist/legacy/build/pdf.worker.entry.js");

// Polyfill for DOMMatrix which is a browser API not available in Node.js
if (typeof global.DOMMatrix === "undefined") {
  global.DOMMatrix = class DOMMatrix {
    constructor(matrix) {
      this.a = 1;
      this.b = 0;
      this.c = 0;
      this.d = 1;
      this.e = 0;
      this.f = 0;

      if (matrix) {
        if (typeof matrix === "string") {
          // Simple parsing for matrix string
          const values = matrix
            .replace(/matrix\(|\)/g, "")
            .split(",")
            .map(Number);
          if (values.length === 6) {
            this.a = values[0];
            this.b = values[1];
            this.c = values[2];
            this.d = values[3];
            this.e = values[4];
            this.f = values[5];
          }
        }
      }
    }

    multiply(other) {
      return new DOMMatrix();
    }

    translate(tx, ty) {
      return new DOMMatrix();
    }

    scale(sx, sy) {
      return new DOMMatrix();
    }
  };
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB limit
const CHUNK_SIZE = 1000; // Smaller chunks to reduce memory
const BATCH_SIZE = 5; // Process embeddings in batches

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

async function processPDFStreaming(buffer) {
  try {
    const data = await pdf(buffer);
    const extractedText = data.text;
    return splitTextIntoChunks(extractedText, CHUNK_SIZE, 100);
  } catch (error) {
    console.error("PDF processing error:", error);
    throw error;
  }
}

async function uploadFile(req, res) {
  try {
    if (!req.files || !req.files.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const file = req.files.file;
    const mimetype = file.mimetype;

    // Enforce file size limit
    if (file.size > MAX_FILE_SIZE) {
      return res.status(400).json({
        error: `File too large. Maximum size is ${
          MAX_FILE_SIZE / (1024 * 1024)
        }MB`,
      });
    }

    console.log(`Processing file: ${file.name} (${file.size} bytes)`);

    let chunks = [];

    try {
      if (mimetype === "application/pdf") {
        // Use streaming PDF processing
        chunks = await processPDFStreaming(file.data);
      } else if (
        mimetype ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      ) {
        const mm = await mammoth.extractRawText({
          buffer: file.data,
          options: {
            includeDefaultStyleMap: false, // Reduce memory usage
          },
        });
        const extractedText = mm.value || "";
        chunks = splitTextIntoChunks(extractedText, CHUNK_SIZE, 100);
        // Clear the large text from memory
        mm.value = null;
      } else if (mimetype === "text/plain") {
        const extractedText = file.data.toString("utf8");
        chunks = splitTextIntoChunks(extractedText, CHUNK_SIZE, 100);
      } else {
        return res.status(400).json({ error: "Unsupported file type" });
      }
    } catch (err) {
      console.error("Text extraction error:", err);
      return res
        .status(500)
        .json({ error: "Failed to extract text from file" });
    }

    // Process embeddings in batches to avoid memory overload
    const storedChunks = [];
    const totalChunks = chunks.length;

    for (let i = 0; i < totalChunks; i += BATCH_SIZE) {
      const batch = chunks.slice(i, Math.min(i + BATCH_SIZE, totalChunks));

      try {
        // Process each chunk in the batch individually to avoid array memory buildup
        for (let j = 0; j < batch.length; j++) {
          const chunk = batch[j];
          const chunkIndex = i + j;

          if (!chunk || chunk.trim().length === 0) continue;

          try {
            const emb = await generateEmbedding(chunk);
            if (!emb) {
              console.warn(
                `Skipping chunk ${chunkIndex} due to null embedding`
              );
              continue;
            }

            const id = uuidv4();
            await storeEmbedding(id, chunk, emb, {
              type: "file_chunk",
              filename: file.name,
              chunkIndex: chunkIndex,
            });

            storedChunks.push({ id, index: chunkIndex });
          } catch (embErr) {
            console.error(
              `Error processing chunk ${chunkIndex}:`,
              embErr.message
            );
            // Continue with next chunk instead of failing entire upload
          }
        }

        // Clear batch from memory and allow GC
        batch.length = 0;

        // Add delay between batches to prevent overwhelming the system
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Send progress update if needed (optional)
        console.log(
          `Processed ${Math.min(
            i + BATCH_SIZE,
            totalChunks
          )}/${totalChunks} chunks`
        );
      } catch (batchErr) {
        console.error(
          `Batch processing error at index ${i}:`,
          batchErr.message
        );
        // Continue with next batch
      }
    }

    // Clear chunks array from memory
    chunks = null;

    // Generate QA only for small files to save memory
    let qa = null;
    if (file.size < 100 * 1024 && storedChunks.length > 0) {
      // Only for files under 100KB
      try {
        // Use only first few stored chunks for QA generation
        const qaContextIds = storedChunks.slice(0, 3).map((sc) => sc.id);
        const qaContext = qaContextIds.join(" "); // Simplified context

        qa = await generateQA(qaContext);

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
      } catch (qaErr) {
        console.error("QA generation error:", qaErr.message);
        // Continue without QA if it fails
      }
    }

    // Force garbage collection if available (optional)
    if (global.gc) {
      global.gc();
    }

    res.json({
      message: "File processed successfully",
      fileName: file.name,
      fileSize: file.size,
      chunksStored: storedChunks.length,
      qa: qa,
    });
  } catch (err) {
    console.error("uploadFile error:", err);
    res.status(500).json({ error: "Failed to process file" });
  }
}

module.exports = { chatWithAIStream, uploadFile };
