// middleware/upload.js
const multer = require("multer");

const storage = multer.memoryStorage(); // keeps file in memory as Buffer

// Supported MIME types
const SUPPORTED_TYPES = {
  PDF: "application/pdf",
  DOCX: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  TEXT: "text/plain",
  CSV: "text/csv",
  EXCEL: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  EXCEL_LEGACY: "application/vnd.ms-excel",
};

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB limit
  fileFilter: (req, file, cb) => {
    console.log("Upload middleware - File received:", {
      fieldname: file.fieldname,
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
    });

    const allowedTypes = Object.values(SUPPORTED_TYPES);
    if (allowedTypes.includes(file.mimetype)) {
      console.log("File type accepted:", file.mimetype);
      cb(null, true);
    } else {
      console.log("File type rejected:", file.mimetype);
      cb(
        new Error(
          `Unsupported file type: ${file.mimetype}. Allowed types: PDF, DOCX, TXT, CSV, XLSX, XLS`
        ),
        false
      );
    }
  },
});

module.exports = upload;
