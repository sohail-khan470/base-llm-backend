// services/embeddingService.js - MODIFIED VERSION
const { getOrCreateCollection } = require("../config/chroma");
const axios = require("axios");
require("dotenv").config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_EMBED_ENDPOINT = "https://api.openai.com/v1/embeddings";
const OLLAMA_EMBED_ENDPOINT =
  process.env.OLLAMA_EMBED_ENDPOINT || "http://localhost:11434/api/embeddings";

// Reduced text limits to prevent memory issues
const MAX_TEXT_LENGTH = 4000; // Reduced from 8000
const EMBEDDING_TIMEOUT = 20000; // 20 seconds timeout

async function generateEmbedding(text) {
  if (!text || typeof text !== "string" || text.trim() === "") {
    console.warn("generateEmbedding: empty text");
    return null;
  }

  // More aggressive truncation to prevent memory issues
  const truncatedText =
    text.length > MAX_TEXT_LENGTH ? text.substring(0, MAX_TEXT_LENGTH) : text;

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
          timeout: EMBEDDING_TIMEOUT,
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        }
      );

      const embedding = resp.data?.data?.[0]?.embedding;

      // Clear response from memory
      resp.data = null;

      if (!Array.isArray(embedding) || embedding.length === 0) return null;
      return embedding;
    } catch (err) {
      console.error("OpenAI embedding error:", err.message);
      return null;
    }
  }

  // Fallback to Ollama (local)
  try {
    const resp = await axios.post(
      OLLAMA_EMBED_ENDPOINT,
      {
        model: "nomic-embed-text:latest",
        prompt: truncatedText,
      },
      {
        timeout: EMBEDDING_TIMEOUT,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      }
    );

    const embedding = resp.data?.embedding || resp.data?.data?.[0]?.embedding;

    // Clear response from memory
    resp.data = null;

    if (!Array.isArray(embedding) || embedding.length === 0) {
      console.error("Ollama embedding: unexpected response");
      return null;
    }
    return embedding;
  } catch (err) {
    console.error("Ollama embedding error:", err.message);
    return null;
  }
}

// Modified to handle arrays of text for batch processing
async function generateEmbeddings(texts) {
  if (!Array.isArray(texts)) {
    const result = await generateEmbedding(texts);
    return result ? [result] : [];
  }

  const embeddings = [];

  // Process one at a time to avoid memory spike
  for (const text of texts) {
    try {
      const emb = await generateEmbedding(text);
      embeddings.push(emb);

      // Small delay between embeddings to prevent overwhelming the service
      await new Promise((resolve) => setTimeout(resolve, 50));
    } catch (err) {
      console.error("Batch embedding error:", err.message);
      embeddings.push(null);
    }
  }

  return embeddings;
}

async function storeEmbedding(ids, texts, embeddings, metadatas = []) {
  // Handle both single and batch storage
  const idArray = Array.isArray(ids) ? ids : [ids];
  const textArray = Array.isArray(texts) ? texts : [texts];
  const embArray = Array.isArray(embeddings[0]) ? embeddings : [embeddings];
  const metaArray = Array.isArray(metadatas) ? metadatas : [metadatas];

  // Validate all embeddings
  const validIndices = [];
  for (let i = 0; i < embArray.length; i++) {
    if (Array.isArray(embArray[i]) && embArray[i].length > 0) {
      validIndices.push(i);
    }
  }

  if (validIndices.length === 0) {
    console.warn("storeEmbedding: no valid embeddings to store");
    return;
  }

  // Filter to only valid items
  const validIds = validIndices.map((i) => idArray[i]);
  const validTexts = validIndices.map((i) => textArray[i]);
  const validEmbs = validIndices.map((i) => embArray[i]);
  const validMetas = validIndices.map((i) => metaArray[i] || {});

  try {
    const collection = await getOrCreateCollection("chat_context");

    // Store in smaller batches if necessary
    const STORE_BATCH_SIZE = 10;
    for (let i = 0; i < validIds.length; i += STORE_BATCH_SIZE) {
      const batchEnd = Math.min(i + STORE_BATCH_SIZE, validIds.length);

      await collection.add({
        ids: validIds.slice(i, batchEnd),
        documents: validTexts.slice(i, batchEnd),
        embeddings: validEmbs.slice(i, batchEnd),
        metadatas: validMetas.slice(i, batchEnd),
      });

      // Small delay between batch stores
      if (batchEnd < validIds.length) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
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
      nResults: Math.min(nResults, 10), // Limit max results to prevent memory issues
      include: ["documents", "metadatas", "distances"],
    });

    // Properly handle the nested array structure
    const docs = results.documents?.[0] || [];
    const metas = results.metadatas?.[0] || [];
    const distances = results.distances?.[0] || [];
    const ids = results.ids?.[0] || [];

    const items = ids.map((id, i) => ({
      id: id,
      document: docs[i] || "",
      metadata: metas[i] || {},
      distance: distances[i] ?? null,
    }));

    // Clear results from memory
    results.documents = null;
    results.metadatas = null;
    results.distances = null;
    results.ids = null;

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
  generateEmbeddings, // New batch function
  storeEmbedding,
  queryContextByEmbedding,
  queryContext,
};
