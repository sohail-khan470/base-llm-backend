const { streamAIResponse, generateQA } = require("../services/llmService");
const {
  storeEmbedding,
  queryContext,
  generateEmbedding,
} = require("../services/embeddingService");

const chatWithAIStream = async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: "Prompt required" });
  }

  res.setHeader("Content-Type", "text/plain");
  res.setHeader("Transfer-Encoding", "chunked");

  let isResponseEnded = false;
  const sendToken = (token) => {
    if (!isResponseEnded) {
      try {
        res.write(token);
      } catch (err) {
        console.error("Error writing to response:", err.message);
      }
    }
  };

  try {
    await streamAIResponse(prompt, sendToken, async (fullResponse) => {
      if (isResponseEnded) return;
      try {
        const embedding = await generateEmbedding(prompt);
        if (embedding) {
          await storeEmbedding(Date.now().toString(), prompt, embedding, {
            type: "prompt",
          });
          await storeEmbedding(Date.now().toString(), fullResponse, embedding, {
            type: "response",
          });

          const context = await queryContext(prompt);
          const qa = await generateQA(context.join("\n"));
          await storeEmbedding(
            `${Date.now()}_qa`,
            `Question: ${qa.question}\nAnswer: ${qa.answer}`,
            embedding,
            { type: "qa" }
          );
        }
        if (!isResponseEnded) {
          isResponseEnded = true;
          res.end();
        }
      } catch (err) {
        console.error("Error in onDone callback:", err.message);
        if (!isResponseEnded) {
          isResponseEnded = true;
          res.status(500).end("Internal server error");
        }
      }
    });
  } catch (err) {
    console.error("AI stream error:", err.message);
    if (!isResponseEnded) {
      isResponseEnded = true;
      res.status(500).end("Internal server error");
    }
  }
};

module.exports = { chatWithAIStream };
