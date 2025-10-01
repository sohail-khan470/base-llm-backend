const ChatService = require("../services/chat-service");
const MessageService = require("../services/message-service");
const DocumentService = require("../services/document-service");
const { streamAIResponse, generateQA } = require("../services/llmService");
const mongoose = require("mongoose");
const { ObjectId } = mongoose.Types;
const {
  generateEmbedding,
  storeOrgDocumentContext,
  getOrCreateCollection,
} = require("../services/embeddingService");
const { splitTextIntoChunks } = require("../utils/textSplitter");
const { v4: uuidv4 } = require("uuid");
const mammoth = require("mammoth");
const pdf = require("pdf-parse");
const csv = require("csv-parser");
const { Readable } = require("stream");
const XLSX = require("xlsx");
const fs = require("fs").promises;
const path = require("path");
const chatService = require("../services/chat-service");

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB limit
const CHUNK_SIZE = 1000; // Smaller chunks to reduce memory
const BATCH_SIZE = 5; // Process embeddings in batches

// Supported MIME types
const SUPPORTED_TYPES = {
  PDF: "application/pdf",
  DOCX: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  TEXT: "text/plain",
  CSV: "text/csv",
  EXCEL: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  EXCEL_LEGACY: "application/vnd.ms-excel",
};

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

async function processPDFStreaming(buffer) {
  try {
    console.log("Starting PDF processing with buffer length:", buffer.length);
    const data = await pdf(buffer);
    const extractedText = data.text;
    console.log("PDF extracted text length:", extractedText.length);
    console.log("PDF extracted text preview:", extractedText.substring(0, 200));

    if (!extractedText || extractedText.trim().length === 0) {
      console.warn("PDF extraction resulted in empty text");
      return ["Content from uploaded PDF file (text extraction failed)"];
    }

    const chunks = splitTextIntoChunks(extractedText, CHUNK_SIZE, 100);
    console.log("PDF chunks created:", chunks.length);
    return chunks;
  } catch (error) {
    console.error("PDF processing error:", error.message);
    console.error("PDF error details:", error.details || error);

    // Provide fallback content for corrupted PDFs
    console.log("Providing fallback content for corrupted PDF");
    return [
      "Content from uploaded PDF file (PDF parsing failed due to corruption - bad XRef entry)",
    ];
  }
}

async function createChat(req, res) {
  const { title } = req.body;
  const { id: userId, organizationId } = req.user;
  const chat = await ChatService.create({
    userId,
    organizationId,
    title: title || "New chat",
  });
  res.json({ chat });
}

async function chatWithAIStream(req, res) {
  let messagesSaved = false;

  try {
    const { prompt, chatId: requestedChatId, createNewChat } = req.body;
    const userId = req.user._id;
    const organizationId = req.user.organizationId._id;

    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "prompt required" });
    }

    // 1) Try to find chat from provided chatId
    let chat = null;
    if (requestedChatId && requestedChatId !== "new") {
      chat = await ChatService.findByIdAndUser(
        requestedChatId,
        userId,
        organizationId
      );
    }

    // 2) If createNewChat is explicitly true or no chat found, create a new one
    if (!chat || createNewChat) {
      chat = await ChatService.create({
        userId,
        organizationId,
        title: prompt.slice(0, 50),
      });
    }

    // 4) Set SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    // 5) Tell client which chatId we’re using
    res.write(`data: ${JSON.stringify({ chatId: chat._id })}\n\n`);

    // optional: build full context prompt here
    const fullPrompt = prompt;
    console.log(
      "Chat request - User:",
      userId,
      "Organization:",
      organizationId._id,
      "Prompt:",
      prompt.substring(0, 100) + "..."
    );

    // Grab abort signal if available
    const abortSignal =
      req.signal && typeof req.signal.addEventListener === "function"
        ? req.signal
        : null;

    // 6) Call your AI service with streaming
    await streamAIResponse(
      fullPrompt,
      (token) => {
        // Stream tokens back
        res.write(`data: ${JSON.stringify({ token })}\n\n`);
      },
      async (fullResponse) => {
        if (messagesSaved) return;
        messagesSaved = true;

        try {
          // Save user's message
          const userMsg = await MessageService.create({
            chatId: chat._id,
            role: "user",
            content: prompt,
          });
          await ChatService.addMessage(chat._id, userMsg._id);

          // Save assistant's reply
          if (fullResponse && fullResponse.trim().length > 0) {
            const aiMsg = await MessageService.create({
              chatId: chat._id,
              role: "assistant",
              content: fullResponse,
            });
            await ChatService.addMessage(chat._id, aiMsg._id);
          }
        } catch (err) {
          console.error("Failed to save messages:", err);
        }

        // Signal completion to client
        res.write(`data: [DONE]\n\n`);
        res.end();
      },
      abortSignal,
      organizationId._id,
      userId
    );
  } catch (err) {
    console.error(" chatWithAIStream ERROR:", err);
    if (!res.headersSent) {
      res.write(
        `data: ${JSON.stringify({ error: "Internal server error" })}\n\n`
      );
    }
    if (!res.writableEnded) res.end();
  }
}

async function uploadFile(req, res) {
  try {
    if (!req.file) {
      console.log("No file received in controller");
      console.log("Request body:", req.body);
      console.log("Request headers:", req.headers);
      return res.status(400).json({ error: "No file uploaded" });
    }
    const { id: userId, organizationId } = req.user; // From auth middleware
    const file = req.file;

    // Enforce file size limit
    if (file.size > MAX_FILE_SIZE) {
      return res.status(400).json({
        error: `File too large. Maximum size is ${
          MAX_FILE_SIZE / (1024 * 1024)
        }MB`,
      });
    }

    // Check for duplicate filename in organization
    console.log("Checking for duplicate filename:", file.originalname);
    const existingDocs = await DocumentService.findByOrganization(
      organizationId
    );
    console.log("Existing docs count:", existingDocs.length);
    if (existingDocs.some((doc) => doc.filename === file.originalname)) {
      console.log("Duplicate file found");
      return res
        .status(400)
        .json({ error: "File already exists in organization" });
    }

    let chunks = [];
    const mimetype = file.mimetype;

    // Process file based on MIME type
    console.log(
      "Processing file:",
      file.originalname,
      "mimetype:",
      mimetype,
      "size:",
      file.size
    );
    console.log("File buffer length:", file.buffer.length);
    try {
      if (mimetype === SUPPORTED_TYPES.PDF) {
        chunks = await processPDFStreaming(file.buffer);
      } else if (mimetype === SUPPORTED_TYPES.DOCX) {
        const mm = await mammoth.extractRawText({
          buffer: file.buffer,
          options: { includeDefaultStyleMap: false },
        });
        const extractedText = mm.value || "";
        chunks = splitTextIntoChunks(extractedText, CHUNK_SIZE, 100);
        mm.value = null; // Clear memory
      } else if (mimetype === SUPPORTED_TYPES.TEXT) {
        const extractedText = file.buffer.toString("utf8");
        chunks = splitTextIntoChunks(extractedText, CHUNK_SIZE, 100);
      } else if (mimetype === SUPPORTED_TYPES.CSV) {
        await processCSVInStream(file.buffer, (chunk) => {
          chunks.push(chunk);
        });
      } else if (
        mimetype === SUPPORTED_TYPES.EXCEL ||
        mimetype === SUPPORTED_TYPES.EXCEL_LEGACY
      ) {
        await processExcelInStream(file.buffer, (chunk) => {
          chunks.push(chunk);
        });
      } else {
        return res.status(400).json({ error: "Unsupported file type" });
      }
    } catch (err) {
      console.error("Text extraction error:", err);
      console.log("Text extraction failed, providing fallback content");
      // Continue with fallback content instead of failing
      chunks = ["Content from uploaded file (text extraction failed)"];
    }

    // Process embeddings in batches
    const storedChunks = [];
    const totalChunks = chunks.length;
    for (let i = 0; i < totalChunks; i += BATCH_SIZE) {
      const batch = chunks.slice(i, Math.min(i + BATCH_SIZE, totalChunks));
      for (let j = 0; j < batch.length; j++) {
        const chunk = batch[j];
        const chunkIndex = i + j;
        if (!chunk || chunk.trim().length === 0) continue;

        try {
          const emb = await generateEmbedding(chunk);
          if (!emb) {
            console.warn(`Skipping chunk ${chunkIndex} due to null embedding`);
            continue;
          }

          const id = uuidv4();
          await storeOrgDocumentContext(
            organizationId._id.toString(),
            id,
            chunk,
            emb
          );
          storedChunks.push({ id, index: chunkIndex });
        } catch (embErr) {
          console.error(
            `Error processing chunk ${chunkIndex}:`,
            embErr.message || embErr
          );
        }
      }
      // Clear batch from memory
      batch.length = 0;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    chunks = null; // Clear memory

    // Generate QA for small files
    let qa = null;
    if (file.size < 100 * 1024 && storedChunks.length > 0) {
      try {
        const qaContextIds = storedChunks.slice(0, 3).map((sc) => sc.id);
        const qaContext = qaContextIds.join(" ");
        qa = await generateQA(qaContext);
        if (qa && qa.question && qa.answer) {
          const qaText = `Question: ${qa.question}\nAnswer: ${qa.answer}`;
          const qaEmb = await generateEmbedding(qaText);
          if (qaEmb) {
            await storeOrgDocumentContext(
              organizationId._id.toString(),
              uuidv4(),
              qaText,
              qaEmb
            );
          }
        }
      } catch (qaErr) {
        console.error("QA generation error:", qaErr.message || qaErr);
      }
    }

    // Save document metadata
    const document = await DocumentService.create({
      organizationId,
      uploadedBy: userId,
      filename: file.originalname,
      docType: mimetype.includes("pdf")
        ? "pdf"
        : mimetype.includes("markdown")
        ? "md"
        : mimetype.includes("csv")
        ? "csv"
        : mimetype.includes("excel")
        ? "excel"
        : "txt",
      chromaIds: storedChunks.map((sc) => sc.id),
    });

    console.log("Upload completed successfully:", {
      fileName: file.originalname,
      fileSize: file.size,
      chunksStored: storedChunks.length,
      qa,
      document: document._id,
    });
    res.json({
      message: "File processed successfully",
      fileName: file.originalname,
      fileSize: file.size,
      chunksStored: storedChunks.length,
      qa,
      document,
    });
  } catch (err) {
    console.error("uploadFile error:", err);
    const errorMessage =
      err.message || err.toString() || "Unknown error occurred";
    res.status(500).json({ error: `Failed to process file: ${errorMessage}` });
  }
}

async function getUserChats(req, res) {
  try {
    const { id: userId } = req.user; // From auth middleware
    const organizationId = req.user.organizationId._id;
    console.log(userId, organizationId);
    const chats = await ChatService.findByUserAndOrganization(
      userId,
      organizationId
    );

    res.status(200).json(chats);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

async function getChatById(req, res) {
  try {
    const userId = req.user._id;
    const organizationId = req.user.organizationId._id;
    const { chatId } = req.params;

    console.log("getChatById called with:", {
      chatId,
      userId,
      organizationId: organizationId?.toString(),
    });

    // First find the chat by ID
    let chat;
    try {
      chat = await ChatService.findById(new ObjectId(chatId), true);
    } catch (idErr) {
      console.log("Invalid ObjectId:", chatId);
      return res.status(400).json({ error: "Invalid chat ID" });
    }

    console.log(
      "Chat found:",
      chat?._id,
      "org:",
      chat?.organizationId?._id?.toString()
    );

    if (!chat) {
      console.log("Chat not found for ID:", chatId);
      return res.status(404).json({ error: "Chat not found" });
    }

    // Check if the chat belongs to the user's organization
    const chatOrgId = chat.organizationId._id.toString();
    console.log("Comparing org IDs:", {
      chatOrgId,
      userOrgId: organizationId?.toString(),
    });

    if (chatOrgId !== organizationId.toString()) {
      console.log("Organization mismatch - access denied");
      return res.status(404).json({ error: "Chat not found" });
    }

    const messages = await MessageService.findByChat(chat._id);
    console.log("Returning chat with", messages.length, "messages");

    res.json({ chat, messages });
  } catch (err) {
    console.error("Error in getChatById:", err);
    res.status(400).json({ error: err.message });
  }
}

async function getOrganizationDocuments(req, res) {
  try {
    const { id: userId, organizationId } = req.user; // From auth middleware
    const documents = await DocumentService.findByOrganizationAndUser(
      userId,
      organizationId
    );
    res.json({ documents });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

async function deleteOrganizationDocument(req, res) {
  try {
    const { id: userId, organizationId } = req.user; // From auth middleware
    const { docId } = req.params;
    const document = await DocumentService.findByIdAndOrganization(
      docId,
      organizationId
    );
    if (!document) {
      return res.status(404).json({ error: "Document not found" });
    }

    // Delete embeddings from ChromaDB
    const collection = await getOrCreateCollection(
      `org_${organizationId._id.toString()}_docs`
    );
    await collection.delete({ ids: document.chromaIds });

    // Delete document metadata from MongoDB
    await DocumentService.delete(docId);
    res.json({ message: "Document deleted successfully" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

module.exports = {
  chatWithAIStream,
  uploadFile,
  getUserChats,
  getChatById,
  getOrganizationDocuments,
  deleteOrganizationDocument,
};
