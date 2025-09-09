const { getOrCreateCollection } = require("../config/chroma");
const axios = require("axios");
require("dotenv").config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_EMBED_ENDPOINT = "https://api.openai.com/v1/embeddings";
const OLLAMA_EMBED_ENDPOINT =
  process.env.OLLAMA_EMBED_ENDPOINT || "http://localhost:11434/api/embeddings";

async function generateEmbedding(text) {
  if (!text || typeof text !== "string" || text.trim() === "") {
    console.warn("generateEmbedding: empty text");
    return null;
  }

  // Truncate very long text to prevent memory issues
  const truncatedText = text.length > 8000 ? text.substring(0, 8000) : text;

  // Prefer OpenAI if API key present
  if (OPENAI_API_KEY) {
    try {
      const resp = await axios.post(
        OPENAI_EMBED_ENDPOINT,
        {
          input: truncatedText,
          model: "text-embedding-ada-002",
        },
        {
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          timeout: 30000,
        }
      );
      const embedding = resp.data?.data?.[0]?.embedding;
      if (!Array.isArray(embedding) || embedding.length === 0) return null;
      return embedding;
    } catch (err) {
      console.error("OpenAI embedding error:", err.message);
      return null;
    }
  }

  // Fallback to Ollama (local) - but be careful with memory!
  try {
    const resp = await axios.post(
      OLLAMA_EMBED_ENDPOINT,
      {
        model: "nomic-embed-text:latest",
        prompt: truncatedText, // Use truncated text
      },
      { timeout: 30000 }
    );

    const embedding = resp.data?.embedding || resp.data?.data?.[0]?.embedding;
    if (!Array.isArray(embedding) || embedding.length === 0) {
      console.error("Ollama embedding: unexpected response", resp.data);
      return null;
    }
    return embedding;
  } catch (err) {
    console.error("Ollama embedding error:", err.message);
    return null;
  }
}

async function storeEmbedding(id, text, embedding, metadata = {}) {
  if (!Array.isArray(embedding) || embedding.length === 0) {
    console.warn("storeEmbedding: invalid embedding for id", id);
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
  } catch (err) {
    console.error("ChromaDB store error:", err.message || err);
    throw err;
  }
}

async function queryContextByEmbedding(embedding, nResults = 5) {
  if (!Array.isArray(embedding) || embedding.length === 0) return [];
  try {
    const collection = await getOrCreateCollection("chat_context");
    const results = await collection.query({
      queryEmbeddings: [embedding],
      nResults: nResults,
      include: ["documents", "metadatas", "distances"],
    });

    // FIXED: Properly handle the nested array structure
    const docs = results.documents?.[0] || [];
    const metas = results.metadatas?.[0] || [];
    const distances = results.distances?.[0] || [];
    const ids = results.ids?.[0] || [];

    const items = ids.map((id, i) => ({
      id: id, // Use the existing ID, don't generate new ones!
      document: docs[i] || "",
      metadata: metas[i] || {},
      distance: distances[i] ?? null,
    }));

    return items;
  } catch (err) {
    console.error("ChromaDB query error:", err.message || err);
    return [];
  }
}

async function queryContext(prompt, nResults = 5) {
  if (!prompt || typeof prompt !== "string") return [];
  const emb = await generateEmbedding(prompt);
  if (!emb) return [];
  return await queryContextByEmbedding(emb, nResults);
}

module.exports = {
  generateEmbedding,
  storeEmbedding,
  queryContextByEmbedding,
  queryContext,
};
