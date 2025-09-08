const {
  generateEmbedding,
  storeEmbedding,
} = require("../services/embeddingService");
const { generateQA } = require("../services/llmService");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");

async function uploadFile(req, res) {
  if (!req.files || !req.files.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  const file = req.files.file;
  let text;

  try {
    if (file.mimetype === "application/pdf") {
      const pdfData = await pdfParse(file.data);
      text = pdfData.text;
    } else if (
      file.mimetype ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      const result = await mammoth.extractRawText({ buffer: file.data });
      text = result.value;
    } else if (file.mimetype === "text/plain") {
      text = file.data.toString();
    } else {
      return res.status(400).json({ error: "Unsupported file type" });
    }

    const embedding = await generateEmbedding(text);
    const id = Date.now().toString();
    await storeEmbedding(id, text, embedding, {
      type: "file",
      filename: file.name,
    });

    const qa = await generateQA(text);
    await storeEmbedding(
      `${id}_qa`,
      `Question: ${qa.question}\nAnswer: ${qa.answer}`,
      embedding,
      {
        type: "qa",
        filename: file.name,
      }
    );

    res.json({ message: "File processed successfully", qa });
  } catch (err) {
    console.error("File processing error:", err.message);
    res.status(500).json({ error: "Failed to process file" });
  }
}

module.exports = { uploadFile };
