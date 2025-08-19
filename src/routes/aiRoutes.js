const express = require("express");
const { aiController } = require("../controllers");

const router = express.Router();

// POST /api/ai/chat
router.post("/chat", aiController.chatWithAIStream);

module.exports = router;
