const ChromaClient = require("chromadb").ChromaClient;
const client = new ChromaClient({ path: "http://localhost:8000" });

async function getOrCreateCollection(collectionName) {
  try {
    return await client.getOrCreateCollection({ name: collectionName });
  } catch (err) {
    console.error("ChromaDB error:", err.message);
    throw err;
  }
}

module.exports = { getOrCreateCollection };
