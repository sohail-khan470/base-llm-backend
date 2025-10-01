const express = require("express");
const router = express.Router();
const {
  chatWithAIStream,
  uploadFile,
  getUserChats,
  getChatById,
  getOrganizationDocuments,
  deleteOrganizationDocument,
} = require("../controllers/aiController");
const {
  authenticateToken,
  requireOrganization,
  requireAdmin,
} = require("../middlewares/auth");
const upload = require("../middlewares/upload");

router.post("/chat", authenticateToken, requireOrganization, chatWithAIStream);
router.post(
  "/upload",
  authenticateToken,
  requireOrganization,
  upload.single("file"),
  (req, res, next) => {
    console.log("Upload route - File received:", {
      file: req.file
        ? {
            fieldname: req.file.fieldname,
            originalname: req.file.originalname,
            mimetype: req.file.mimetype,
            size: req.file.size,
          }
        : null,
      body: req.body,
      user: req.user
        ? {
            id: req.user.id,
            organizationId: req.user.organizationId,
          }
        : null,
    });
    next();
  },
  uploadFile
);
router.get("/chats", authenticateToken, requireOrganization, getUserChats);
router.get(
  "/chat/:chatId",
  authenticateToken,
  requireOrganization,
  getChatById
);
router.get(
  "/documents",
  authenticateToken,
  requireOrganization,
  getOrganizationDocuments
);
router.delete(
  "/documents/:docId",
  authenticateToken,
  requireOrganization,
  requireAdmin,
  deleteOrganizationDocument
);

module.exports = router;
