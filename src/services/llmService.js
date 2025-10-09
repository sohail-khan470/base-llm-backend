const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const {
  generateEmbedding,
  storeUserChatContext,
  queryContext,
} = require("./embeddingService");
require("dotenv").config();
const {
  OPENAI_API_KEY,
  OLLAMA_EMBED_ENDPOINT,
  OLLAMA_GENERATE_ENDPOINT,
} = require("../config/server-config");

const DEFAULT_MODEL_LOCAL =
  process.env.DEFAULT_MODEL_LOCAL || "llama3.1:latest";
const DEFAULT_OPENAI_MODEL =
  process.env.DEFAULT_OPENAI_MODEL || "gpt-3.5-turbo";
const MAX_TOKENS = 2000;

// Improved system prompt that handles both context and general knowledge
const DEFAULT_SYSTEM_PROMPT = `You are an intelligent assistant. Follow these guidelines:
1. Use the provided context to answer questions when relevant information is available
2. If the context doesn't contain the answer, use your general knowledge to provide a helpful response
3. Never say "this does not exist in the context" or similar phrases
4. Always provide the most accurate answer you can, whether from context or general knowledge`;

/**
 * Streams an LLM response and calls onData(token) for each chunk, then onDone(fullResponse).
 * This function performs RAG: queries context and injects into prompt.
 */
async function streamAIResponse(
  prompt,
  onData,
  onDone = () => {},
  reqAbortSignal,
  organizationId,
  userId
) {
  // Create a proper AbortController for axios
  const controller = new AbortController();
  let isStreamActive = true;
  let fullResponse = "";

  // React to external abort (client disconnect)
  if (reqAbortSignal) {
    reqAbortSignal.addEventListener("abort", () => {
      console.log("Request aborted by client");
      isStreamActive = false;
      controller.abort();
    });
  }

  // Build context (RAG) - Get all context without filtering
  const contextItems = await queryCombinedContext(
    prompt,
    organizationId,
    userId,
    5
  );

  console.log(`Retrieved ${contextItems.length} context items`);

  // Prepare the context text - use ALL context items without filtering
  const contextText = contextItems
    .map((i, idx) => `[Source: ${i.source}] ${i.document}`)
    .join("\n\n");

  // Always include context in the prompt, but with clear instructions
  const userContent = contextText
    ? `Context information:\n${contextText}\n\nUser Question: ${prompt}`
    : `User Question: ${prompt}`;

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
          signal: controller.signal,
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
              // Ignore JSON parse errors for non-JSON lines
            }
          }
        }
      });

      response.data.on("end", async () => {
        if (!isStreamActive) return;
        isStreamActive = false;
        onDone(fullResponse);

        // Store prompt and response with proper user context
        try {
          const promptEmb = await generateEmbedding(prompt);
          const respEmb = await generateEmbedding(fullResponse);

          if (promptEmb) {
            await storeUserMessage(userId, uuidv4(), prompt, promptEmb, {
              type: "prompt",
              organizationId: organizationId,
              contextItemsCount: contextItems.length,
            });
          }
          if (respEmb) {
            await storeUserMessage(userId, uuidv4(), fullResponse, respEmb, {
              type: "response",
              organizationId: organizationId,
              contextItemsCount: contextItems.length,
            });
          }
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
      const fullPrompt = `${DEFAULT_SYSTEM_PROMPT}\n\n${userContent}`;

      const response = await axios.post(
        OLLAMA_GENERATE_ENDPOINT,
        {
          model: DEFAULT_MODEL_LOCAL,
          prompt: fullPrompt,
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
            // Ignore parse errors
          }
        }
      });

      response.data.on("end", async () => {
        if (!isStreamActive) return;
        isStreamActive = false;
        onDone(fullResponse);

        // Store prompt and response in user-specific chat collection
        try {
          const promptEmb = await generateEmbedding(prompt);
          const respEmb = await generateEmbedding(fullResponse);
          const promptId = uuidv4();
          const respId = uuidv4();
          if (promptEmb) {
            await storeUserChatContext(userId, promptId, prompt, promptEmb);
          }
          if (respEmb) {
            await storeUserChatContext(userId, respId, fullResponse, respEmb);
          }
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
            {
              role: "system",
              content:
                "You are a helpful assistant that creates Q&A pairs from given context.",
            },
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

// Helper function to store user messages
async function storeUserMessage(
  userId,
  messageId,
  content,
  embedding,
  metadata = {}
) {
  // Implement your storage logic here
  console.log("Storing user message:", {
    userId,
    messageId,
    content: content.substring(0, 100) + "...",
    metadata,
  });
}

// Helper function to query combined context
async function queryCombinedContext(prompt, organizationId, userId, limit) {
  try {
    console.log(
      "Querying context for prompt:",
      prompt.substring(0, 100) + "..."
    );
    console.log("Organization ID:", organizationId, "User ID:", userId);

    const contextItems = await queryContext(
      prompt,
      limit,
      organizationId,
      userId
    );
    console.log("Retrieved context items:", contextItems.length);

    // Debug logging
    if (contextItems.length > 0) {
      console.log("First context item preview:", {
        distance: contextItems[0].distance,
        document: contextItems[0].document
          ? contextItems[0].document.substring(0, 150) + "..."
          : "No document",
        metadata: contextItems[0].metadata,
      });
    }

    // Add source information to each item
    const enrichedItems = contextItems.map((item) => ({
      ...item,
      source:
        item.metadata?.type === "document" ? "knowledge_base" : "chat_history",
    }));

    return enrichedItems;
  } catch (error) {
    console.error("Error querying combined context:", error.message);
    return [];
  }
}

module.exports = { streamAIResponse, generateQA };
