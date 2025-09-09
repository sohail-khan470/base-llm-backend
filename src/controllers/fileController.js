const {
  generateEmbedding,
  storeEmbedding,
} = require("../services/embeddingService");
const { generateQA } = require("../services/llmService");
const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js");
const mammoth = require("mammoth");
const csv = require("csv-parser");
const { Readable } = require("stream");
const XLSX = require("xlsx");

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = require("pdfjs-dist/legacy/build/pdf.worker.entry.js");

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB limit

// Supported MIME types
const SUPPORTED_TYPES = {
  PDF: "application/pdf",
  DOCX: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  TEXT: "text/plain",
  CSV: "text/csv",
  EXCEL: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  EXCEL_LEGACY: "application/vnd.ms-excel",
};

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

async function processCSVInStream(buffer, chunkCallback) {
  return new Promise((resolve, reject) => {
    const stream = Readable.from(buffer);
    let rowCount = 0;
    let chunk = "";

    stream
      .pipe(csv())
      .on("data", (row) => {
        rowCount++;
        // Convert row object to key-value pairs
        const rowText = Object.entries(row)
          .map(([key, value]) => `${key}: ${value}`)
          .join(", ");

        chunk += rowText + "\n";

        // Process in chunks of 50 rows
        if (rowCount % 50 === 0) {
          chunkCallback(chunk);
          chunk = "";
        }
      })
      .on("end", () => {
        // Process any remaining rows
        if (chunk.length > 0) {
          chunkCallback(chunk);
        }
        resolve();
      })
      .on("error", (error) => {
        console.error("CSV processing error:", error);
        reject(error);
      });
  });
}

async function processExcelInStream(buffer, chunkCallback) {
  try {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    let fullText = "";

    workbook.SheetNames.forEach((sheetName) => {
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      // Add sheet name as context
      fullText += `Sheet: ${sheetName}\n`;

      // Process each row
      jsonData.forEach((row, index) => {
        // Skip empty rows
        if (
          row.some((cell) => cell !== null && cell !== undefined && cell !== "")
        ) {
          const rowText = Array.isArray(row)
            ? row.map((cell) => String(cell || "")).join(", ")
            : String(row);
          fullText += `Row ${index + 1}: ${rowText}\n`;
        }
      });

      fullText += "\n";
    });

    // Split the text into chunks
    const chunks = splitTextIntoChunks(fullText, 1200, 200);
    for (const chunk of chunks) {
      await chunkCallback(chunk);
    }
  } catch (error) {
    console.error("Excel processing error:", error);
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

    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      return res
        .status(400)
        .json({
          error: `File size exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`,
        });
    }

    let extractedText = "";
    let chunks = [];

    if (mimetype === SUPPORTED_TYPES.PDF) {
      const pdf = await pdfParse(file.data);
      extractedText = pdf.text || "";
      chunks = splitTextIntoChunks(extractedText, 1200, 200);
    } else if (mimetype === SUPPORTED_TYPES.DOCX) {
      const mm = await mammoth.extractRawText({ buffer: file.data });
      extractedText = mm.value || "";
      chunks = splitTextIntoChunks(extractedText, 1200, 200);
    } else if (mimetype === SUPPORTED_TYPES.TEXT) {
      extractedText = file.data.toString("utf8");
      chunks = splitTextIntoChunks(extractedText, 1200, 200);
    } else if (mimetype === SUPPORTED_TYPES.CSV) {
      // Process CSV directly without extracting full text first
      await processCSVInStream(file.data, (chunk) => {
        chunks.push(chunk);
      });
    } else if (
      mimetype === SUPPORTED_TYPES.EXCEL ||
      mimetype === SUPPORTED_TYPES.EXCEL_LEGACY
    ) {
      // Process Excel files
      await processExcelInStream(file.data, (chunk) => {
        chunks.push(chunk);
      });
    } else {
      return res.status(400).json({ error: "Unsupported file type" });
    }

    // For non-stream processed files, ensure we have text to process
    if (
      [
        SUPPORTED_TYPES.PDF,
        SUPPORTED_TYPES.DOCX,
        SUPPORTED_TYPES.TEXT,
      ].includes(mimetype)
    ) {
      if (!extractedText || extractedText.trim() === "") {
        return res.status(400).json({ error: "No text content found in file" });
      }
    }

    // SAFETY CHECK: Ensure chunks is always an array
    if (!Array.isArray(chunks)) {
      console.warn("Chunks processing did not return array, using fallback");
      chunks = [extractedText || "Content from uploaded file"]; // Fallback to single chunk
    }

    // Filter out empty chunks
    chunks = chunks.filter((chunk) => chunk && chunk.trim().length > 0);

    if (chunks.length === 0) {
      return res.status(400).json({ error: "No valid content chunks created" });
    }

    console.log(`Processing ${chunks.length} chunks from ${file.name}`);

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
          fileType: mimetype,
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
        : extractedText || chunks.join("\n\n");
      qa = await generateQA(fileContext);

      if (qa && qa.question && qa.answer) {
        const qaText = `Question: ${qa.question}\nAnswer: ${qa.answer}`;
        const qaEmb = await generateEmbedding(qaText);
        if (qaEmb) {
          await storeEmbedding(uuidv4(), qaText, qaEmb, {
            type: "file_qa",
            filename: file.name,
            fileType: mimetype,
          });
        }
      }
    } catch (qaError) {
      console.error("QA generation failed:", qaError.message);
      qa = { error: "QA generation failed" };
    }

    res.json({
      message: "File processed successfully",
      fileName: file.name,
      fileType: mimetype,
      chunksStored: storedChunks.length,
      totalChunks: chunks.length,
      qa,
    });
  } catch (err) {
    console.error("uploadFile error:", err.message || err);
    res
      .status(500)
      .json({
        error: "Failed to process file: " + (err.message || "Unknown error"),
      });
  }
}

module.exports = { uploadFile };
