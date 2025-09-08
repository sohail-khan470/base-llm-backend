const { getOrCreateCollection } = require("../config/chroma");
const axios = require("axios");
require("dotenv").config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OLLAMA_ENDPOINT = "http://localhost:11434/api/embeddings";
const OPENAI_ENDPOINT = "https://api.openai.com/v1/embeddings";

async function generateEmbedding(text) {
  if (!text || typeof text !== "string" || text.trim() === "") {
    console.error("Invalid or empty text input for embedding:", text);
    return null;
  }

  if (OPENAI_API_KEY) {
    try {
      console.log(
        "Attempting to generate embedding with OpenAI for text:",
        text.substring(0, 50) + "..."
      );
      const response = await axios.post(
        OPENAI_ENDPOINT,
        {
          input: text,
          model: "text-embedding-ada-002",
        },
        {
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );
      console.log(
        "OpenAI raw response:",
        JSON.stringify(response.data, null, 2)
      );
      const embedding = response.data.data[0].embedding;
      if (!embedding || !Array.isArray(embedding) || embedding.length === 0) {
        console.error("Invalid OpenAI embedding response:", response.data);
        return null;
      }
      console.log("OpenAI embedding generated, length:", embedding.length);
      return embedding;
    } catch (err) {
      console.error(
        "OpenAI embedding error:",
        err.message,
        err.response?.data || ""
      );
      return null;
    }
  } else {
    try {
      console.log(
        "Attempting to generate embedding with Ollama for text:",
        text.substring(0, 50) + "..."
      );
      const response = await axios.post(OLLAMA_ENDPOINT, {
        model: "nomic-embed-text",
        prompt: text,
      });
      console.log(
        "Ollama raw response:",
        JSON.stringify(response.data, null, 2)
      );
      const embedding = response.data.embedding;
      if (!embedding || !Array.isArray(embedding) || embedding.length === 0) {
        console.error("Invalid Ollama embedding response:", response.data);
        return null;
      }
      console.log("Ollama embedding generated, length:", embedding.length);
      return embedding;
    } catch (err) {
      console.error(
        "Ollama embedding error:",
        err.message,
        err.response?.data || ""
      );
      return null;
    }
  }
}

async function storeEmbedding(id, text, embedding, metadata = {}) {
  if (!embedding || !Array.isArray(embedding) || embedding.length === 0) {
    console.warn(
      "Skipping storeEmbedding due to invalid or null embedding for ID:",
      id
    );
    return;
  }
  try {
    const collection = await getOrCreateCollection("chat_context");
    await collection.add({
      ids: [id],
      documents: [text],
      embeddings: [embedding],
      metadatas: [metadata],
    });
    console.log(`Stored embedding for ID: ${id}`);
  } catch (err) {
    console.error("ChromaDB store error:", err.message);
  }
}

async function queryContext(prompt, nResults = 5) {
  if (!prompt || typeof prompt !== "string" || prompt.trim() === "") {
    console.warn(
      "Empty or invalid prompt for queryContext, returning empty context"
    );
    return [];
  }

  const embedding = await generateEmbedding(prompt);
  if (!embedding || !Array.isArray(embedding) || embedding.length === 0) {
    console.warn(
      "No valid embedding generated for prompt, returning empty context"
    );
    return [];
  }

  try {
    const collection = await getOrCreateCollection("chat_context");
    console.log("Querying ChromaDB with embedding length:", embedding.length);
    const results = await collection.query({
      queryEmbeddings: [embedding], // Use camelCase to match ChromaDB API
      nResults: nResults,
    });
    if (
      !results.documents ||
      !results.documents[0] ||
      results.documents[0].length === 0
    ) {
      console.log("No embeddings found in ChromaDB, returning empty context");
      return [];
    }
    console.log(
      "ChromaDB query successful, retrieved",
      results.documents[0].length,
      "documents"
    );
    return results.documents[0];
  } catch (err) {
    console.error("ChromaDB query error:", err.message, err.stack);
    return [];
  }
}

module.exports = { generateEmbedding, storeEmbedding, queryContext };
