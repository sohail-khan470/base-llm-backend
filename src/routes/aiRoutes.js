const express = require("express");
const { aiController, fileController } = require("../controllers");

const router = express.Router();

router.post("/chat", aiController.chatWithAIStream);
router.post("/upload", fileController.uploadFile);

module.exports = router;
