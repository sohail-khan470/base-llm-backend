const { streamAIResponse } = require("../services/aiService");

const chatWithAIStream = async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: "Prompt required" });

  res.setHeader("Content-Type", "text/plain");
  res.setHeader("Transfer-Encoding", "chunked"); // Optional but ensures chunked streaming

  const sendToken = (token) => res.write(token); // Write plain token (no SSE wrapper)

  try {
    await streamAIResponse(prompt, sendToken); // Await until Ollama stream completes
    res.end(); // End the stream cleanly
  } catch (err) {
    console.error(err);
    res.end(); // End on error
  }
};

module.exports = { chatWithAIStream };
