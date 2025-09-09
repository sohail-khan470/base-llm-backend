// utils/textSplitter.js
function splitTextIntoChunks(text, chunkSizeChars = 1200, chunkOverlap = 200) {
  if (!text || typeof text !== "string") return []; // Always return array

  try {
    const cleaned = text.replace(/\r\n/g, "\n").trim();
    if (cleaned.length === 0) return []; // Return empty array

    const chunks = [];
    let start = 0;

    while (start < cleaned.length) {
      const end = Math.min(start + chunkSizeChars, cleaned.length);
      let chunk = cleaned.slice(start, end);

      // try to cut at last newline or period inside the chunk for better boundaries
      if (end < cleaned.length) {
        const lastNewline = chunk.lastIndexOf("\n");
        const lastPeriod = chunk.lastIndexOf(".");
        const cutAt = Math.max(lastNewline, lastPeriod);
        if (cutAt > Math.floor(chunk.length * 0.4)) {
          chunk = chunk.slice(0, cutAt + 1);
        }
      }

      const trimmedChunk = chunk.trim();
      if (trimmedChunk.length > 0) {
        chunks.push(trimmedChunk);
      }

      start += chunk.length - Math.min(chunkOverlap, chunk.length);
      if (start <= 0) start = end; // Prevent infinite loops
    }

    return chunks.filter((chunk) => chunk.length > 0); // Ensure we return array
  } catch (error) {
    console.error("Text splitting error:", error);
    return []; // Always return array, even on error
  }
}

module.exports = { splitTextIntoChunks };
