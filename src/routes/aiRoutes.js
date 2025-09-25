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

router.post("/chat", authenticateToken, requireOrganization, chatWithAIStream);
router.post("/upload", authenticateToken, requireOrganization, uploadFile);
router.get("/chats", authenticateToken, requireOrganization, getUserChats);
router.get(
  "/chats/:chatId",
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
