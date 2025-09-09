// Common wrapper to get/create collection
const { ChromaClient } = require("chromadb");
const CHROMA_URL = process.env.CHROMA_URL || "http://localhost:8000";

const client = new ChromaClient({ path: CHROMA_URL });

async function getOrCreateCollection(collectionName) {
  try {
    // depending on chromadb client, getOrCreateCollection signature may vary
    // this matches the client used previously in your code
    return await client.getOrCreateCollection({ name: collectionName });
  } catch (err) {
    console.error("ChromaDB error:", err.message || err);
    throw err;
  }
}

module.exports = { getOrCreateCollection };
