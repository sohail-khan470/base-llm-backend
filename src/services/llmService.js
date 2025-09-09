const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const {
  generateEmbedding,
  storeEmbedding,
  queryContext,
  queryContextByEmbedding,
} = require("./embeddingService");
require("dotenv").config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OLLAMA_GENERATE_ENDPOINT =
  process.env.OLLAMA_GENERATE_ENDPOINT || "http://localhost:11434/api/generate";
const OLLAMA_EMBED_ENDPOINT =
  process.env.OLLAMA_EMBED_ENDPOINT || "http://localhost:11434/api/embeddings";

const DEFAULT_MODEL_LOCAL = "phi3:latest"; // your local model name
const DEFAULT_OPENAI_MODEL = "gpt-3.5-turbo";
const MAX_TOKENS = 2000;

const DEFAULT_SYSTEM_PROMPT = `
You are an intelligent assistant. Use the provided context to answer concisely and accurately.
`;

/**
 * Streams an LLM response and calls onData(token) for each chunk, then onDone(fullResponse).
 * This function performs RAG: queries context and injects into prompt.
 */
async function streamAIResponse(
  prompt,
  onData,
  onDone = () => {},
  reqAbortSignal
) {
  // Build context (RAG)
  const contextItems = await queryContext(prompt, 5);
  const contextText = contextItems
    .map((i, idx) => `Context ${idx + 1}: ${i.document}`)
    .join("\n\n");

  const userContent = contextText
    ? `${contextText}\n\nUser: ${prompt}`
    : `User: ${prompt}`;

  let isStreamActive = true;
  let fullResponse = "";

  // react to external abort (client disconnect)
  if (reqAbortSignal) {
    reqAbortSignal.addEventListener("abort", () => {
      console.log("Request aborted by client");
      isStreamActive = false;
      onDone(fullResponse || "");
    });
  }

  if (OPENAI_API_KEY) {
    // Use OpenAI streaming chat completions
    try {
      const response = await axios.post(
        "https://api.openai.com/v1/chat/completions",
        {
          model: DEFAULT_OPENAI_MODEL,
          messages: [
            { role: "system", content: DEFAULT_SYSTEM_PROMPT },
            { role: "user", content: userContent },
          ],
          stream: true,
          max_tokens: MAX_TOKENS,
        },
        {
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          responseType: "stream",
          timeout: 120000,
        }
      );

      response.data.on("data", (chunk) => {
        if (!isStreamActive) return;
        const lines = chunk.toString().split("\n").filter(Boolean);
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6).trim();
            if (data === "[DONE]") {
              isStreamActive = false;
              onDone(fullResponse);
              return;
            }
            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) {
                onData(delta);
                fullResponse += delta;
              }
            } catch (err) {
              // ignore JSON parse errors for non-JSON lines
            }
          }
        }
      });

      response.data.on("end", async () => {
        if (!isStreamActive) {
          return;
        }
        isStreamActive = false;
        onDone(fullResponse);
        // store response and prompt embeddings separately
        try {
          const promptEmb = await generateEmbedding(prompt);
          const respEmb = await generateEmbedding(fullResponse);
          const promptId = uuidv4();
          const respId = uuidv4();
          if (promptEmb)
            await storeEmbedding(promptId, prompt, promptEmb, {
              type: "prompt",
            });
          if (respEmb)
            await storeEmbedding(respId, fullResponse, respEmb, {
              type: "response",
            });
        } catch (err) {
          console.error("Post-stream store error:", err.message);
        }
      });

      response.data.on("error", (err) => {
        console.error("OpenAI stream error:", err.message);
        if (isStreamActive) {
          isStreamActive = false;
          onDone(fullResponse);
        }
      });
    } catch (err) {
      console.error("OpenAI generate error:", err.message || err);
      onDone("");
      throw err;
    }
  } else {
    // Ollama local streaming
    try {
      const response = await axios.post(
        OLLAMA_GENERATE_ENDPOINT,
        {
          model: DEFAULT_MODEL_LOCAL,
          prompt: `${DEFAULT_SYSTEM_PROMPT}\n\n${userContent}`,
          stream: true,
          options: { num_predict: MAX_TOKENS },
        },
        {
          responseType: "stream",
          timeout: 120000,
        }
      );

      response.data.on("data", (chunk) => {
        if (!isStreamActive) return;
        const lines = chunk.toString().split("\n").filter(Boolean);
        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            if (data.response) {
              onData(data.response);
              fullResponse += data.response;
            }
            if (data.done) {
              isStreamActive = false;
              onDone(fullResponse);
              return;
            }
          } catch (err) {
            // ignore parse errors
          }
        }
      });

      response.data.on("end", async () => {
        if (!isStreamActive) return;
        isStreamActive = false;
        onDone(fullResponse);
        try {
          const promptEmb = await generateEmbedding(prompt);
          const respEmb = await generateEmbedding(fullResponse);
          const promptId = uuidv4();
          const respId = uuidv4();
          if (promptEmb)
            await storeEmbedding(promptId, prompt, promptEmb, {
              type: "prompt",
            });
          if (respEmb)
            await storeEmbedding(respId, fullResponse, respEmb, {
              type: "response",
            });
        } catch (err) {
          console.error("Post-stream store error:", err.message || err);
        }
      });

      response.data.on("error", (err) => {
        console.error("Ollama stream error:", err.message);
        if (isStreamActive) {
          isStreamActive = false;
          onDone(fullResponse);
        }
      });
    } catch (err) {
      console.error("Ollama generate error:", err.message || err);
      onDone("");
      throw err;
    }
  }
}

/**
 * generateQA(contextText) -> returns {question, answer}
 * Uses LLM (OpenAI or Ollama) synchronously (non-stream) to create a Q/A pair.
 */
async function generateQA(contextText) {
  const prompt = `Given the following context, generate one concise Question and its Answer.\n\nContext:\n${contextText}\n\nFormat:\nQuestion: <question>\nAnswer: <answer>\n`;
  try {
    if (OPENAI_API_KEY) {
      const res = await axios.post(
        "https://api.openai.com/v1/chat/completions",
        {
          model: DEFAULT_OPENAI_MODEL,
          messages: [
            { role: "system", content: DEFAULT_SYSTEM_PROMPT },
            { role: "user", content: prompt },
          ],
          max_tokens: 300,
        },
        {
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );
      const text = res.data?.choices?.[0]?.message?.content || "";
      const [qPart, aPart] = text.split("\nAnswer:");
      const question = (qPart || "").replace(/^Question:\s*/i, "").trim();
      const answer = (aPart || "").trim();
      return { question, answer };
    } else {
      const res = await axios.post(
        OLLAMA_GENERATE_ENDPOINT,
        {
          model: DEFAULT_MODEL_LOCAL,
          prompt,
          options: { num_predict: 300 },
        },
        { timeout: 30000 }
      );
      const text = res.data?.response || "";
      const [qPart, aPart] = text.split("\nAnswer:");
      const question = (qPart || "").replace(/^Question:\s*/i, "").trim();
      const answer = (aPart || "").trim();
      return { question, answer };
    }
  } catch (err) {
    console.error("generateQA error:", err.message || err);
    return { question: "", answer: "" };
  }
}

module.exports = { streamAIResponse, generateQA };
