const axios = require("axios");
require("dotenv").config();
const {
  generateEmbedding,
  storeEmbedding,
  queryContext,
} = require("./embeddingService");

const DEFAULT_MODEL = "phi3:latest";
const MAX_TOKENS = 2000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OLLAMA_GENERATE_ENDPOINT = "http://localhost:11434/api/generate";
const OPENAI_CHAT_ENDPOINT = "https://api.openai.com/v1/chat/completions";

const DEFAULT_SYSTEM_PROMPT = `
You are an intelligent assistant designed to provide helpful and accurate responses. Use clear, concise language and maintain a friendly tone. If no prior context is available, assume a general knowledge base and respond to the best of your ability. When relevant, include examples or explanations to clarify your answer.
`;

async function streamAIResponse(prompt, onData, onDone = () => {}) {
  let isStreamActive = true;

  const context = await queryContext(prompt);
  const contextText = context.length > 0 ? context.join("\n") : "";
  const fullPrompt = `System: ${DEFAULT_SYSTEM_PROMPT}\nContext: ${contextText}\n\nPrompt: ${prompt}`;

  if (OPENAI_API_KEY) {
    try {
      console.log(
        "Streaming with OpenAI, prompt:",
        prompt.substring(0, 50) + "..."
      );
      const response = await axios.post(
        OPENAI_CHAT_ENDPOINT,
        {
          model: "gpt-3.5-turbo",
          messages: [
            { role: "system", content: DEFAULT_SYSTEM_PROMPT },
            { role: "user", content: contextText + "\n\n" + prompt },
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
        }
      );

      let fullResponse = "";
      response.data.on("data", (chunk) => {
        if (!isStreamActive) return;
        const lines = chunk.toString().split("\n").filter(Boolean);
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") {
              isStreamActive = false;
              onDone(fullResponse);
              return;
            }
            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices[0].delta.content;
              if (content) {
                onData(content);
                fullResponse += content;
              }
            } catch (err) {
              console.error("OpenAI parse error:", err.message);
            }
          }
        }
      });

      response.data.on("end", () => {
        if (isStreamActive) {
          console.log("OpenAI stream ended, storing response");
          isStreamActive = false;
          onDone(fullResponse);
          storeEmbedding(Date.now().toString(), fullPrompt, fullResponse);
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
      console.error("OpenAI error:", err.message);
      if (isStreamActive) {
        isStreamActive = false;
        onDone("");
      }
      throw err;
    }
  } else {
    try {
      console.log(
        "Streaming with Ollama, prompt:",
        prompt.substring(0, 50) + "..."
      );
      const response = await axios.post(
        OLLAMA_GENERATE_ENDPOINT,
        {
          model: DEFAULT_MODEL,
          prompt: fullPrompt,
          stream: true,
          options: { num_predict: MAX_TOKENS },
        },
        { responseType: "stream" }
      );

      let fullResponse = "";
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
              storeEmbedding(Date.now().toString(), fullPrompt, fullResponse);
            }
          } catch (err) {
            console.error("Ollama parse error:", err.message);
          }
        }
      });

      response.data.on("end", () => {
        if (isStreamActive) {
          console.log("Ollama stream ended, storing response");
          isStreamActive = false;
          onDone(fullResponse);
          storeEmbedding(Date.now().toString(), fullPrompt, fullResponse);
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
      console.error("Ollama error:", err.message);
      if (isStreamActive) {
        isStreamActive = false;
        onDone("");
      }
      throw err;
    }
  }
}

async function generateQA(context) {
  const fallbackContext =
    context ||
    "General knowledge: Provide a question and answer pair based on common knowledge or the user's prompt.";
  const prompt = `Based on the following context, generate a relevant question and answer pair:\n\n${fallbackContext}`;

  let response;
  if (OPENAI_API_KEY) {
    try {
      const res = await axios.post(
        OPENAI_CHAT_ENDPOINT,
        {
          model: "gpt-3.5-turbo",
          messages: [
            { role: "system", content: DEFAULT_SYSTEM_PROMPT },
            { role: "user", content: prompt },
          ],
          max_tokens: 500,
        },
        {
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );
      response = res.data.choices[0].message.content;
    } catch (err) {
      console.error("OpenAI Q/A error:", err.message);
      return { question: "", answer: "" };
    }
  } else {
    try {
      const res = await axios.post(OLLAMA_GENERATE_ENDPOINT, {
        model: DEFAULT_MODEL,
        prompt,
        options: { num_predict: 500 },
      });
      response = res.data.response;
    } catch (err) {
      console.error("Ollama Q/A error:", err.message);
      return { question: "", answer: "" };
    }
  }

  try {
    const [question, answer] = response.split("\nAnswer: ");
    return {
      question: question?.replace("Question: ", "") || "",
      answer: answer || "",
    };
  } catch (err) {
    console.error("Q/A parsing error:", err.message);
    return { question: "", answer: "" };
  }
}

module.exports = { streamAIResponse, generateQA };
