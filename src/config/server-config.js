require("dotenv").config();

const PORT = process.env.PORT || 3008;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const EMBEDDING_MODEL =
  process.env.EMBEDDING_MODEL || "mxbai-embed-large:latest";
const OLLAMA_EMBED_ENDPOINT =
  process.env.OLLAMA_EMBED_ENDPOINT || "http://localhost:11434/api/embeddings";
const DEFAULT_MODEL_LOCAL =
  process.env.DEFAULT_MODEL_LOCAL || "llama3.1:latest";
const DEFAULT_OPENAI_MODEL =
  process.env.DEFAULT_OPENAI_MODEL || "gpt-3.5-turbo";
const CHROMA_URL = process.env.CHROMA_URL || "http://localhost:8000";
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/chatbot";
const OLLAMA_GENERATE_ENDPOINT =
  process.env.OLLAMA_GENERATE_ENDPOINT || "http://localhost:11434/api/generate";
const OPENAI_EMBED_ENDPOINT =
  process.env.OPENAI_EMBED_ENDPOINT || "https://api.openai.com/v1/embeddings";

module.exports = {
  PORT,
  OPENAI_API_KEY,
  EMBEDDING_MODEL,
  OLLAMA_EMBED_ENDPOINT,
  OPENAI_EMBED_ENDPOINT,
  DEFAULT_MODEL_LOCAL,
  DEFAULT_OPENAI_MODEL,
  OLLAMA_GENERATE_ENDPOINT,
  CHROMA_URL,
  MONGO_URI,
};
