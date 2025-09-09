const express = require("express");
const router = express.Router();
const { chatWithAIStream, uploadFile } = require("../controllers/aiController");

router.post("/chat", chatWithAIStream);
router.post("/upload", uploadFile);

module.exports = router;
