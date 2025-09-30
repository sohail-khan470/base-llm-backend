const express = require("express");
const router = express.Router();
const chatController = require("../controllers/chatController");
const {
  authenticateToken,
  requireOrganization,
  requireAdmin,
} = require("../middlewares/auth");

router.post("/", chatController.createChat);

router.get(
  "/",
  authenticateToken,
  requireOrganization,
  chatController.getAllChats
);

router.get(
  "/organization/:organizationId",
  chatController.getOrganizationChats
);

router.get("/user/:userId", chatController.getUserChats);

router.get(
  "/user/:userId/organization/:organizationId",
  chatController.getUserOrganizationChats
);

router.get(
  "/:id",
  authenticateToken,
  requireOrganization,
  chatController.getChatById
);

router.get("/:chatId/access", chatController.getChatByIdAndUser);

router.put("/:id", chatController.updateChat);

router.patch("/:id/title", chatController.updateChatTitle);

router.put("/:id/messages", chatController.addMessageToChat);

router.delete("/:id/messages", chatController.removeMessageFromChat);

router.delete("/:id", chatController.deleteChat);

router.get("/user/:userId/recent", chatController.getRecentChats);

module.exports = router;
