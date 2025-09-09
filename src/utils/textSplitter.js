// utils/textSplitter.js - NEW FILE
function splitTextIntoChunks(text, chunkSize = 1000, overlap = 100) {
  if (!text || typeof text !== "string") return [];

  const chunks = [];
  let start = 0;

  while (start < text.length) {
    let end = start + chunkSize;

    // Try to break at sentence or word boundary
    if (end < text.length) {
      // Look for sentence end
      const sentenceEnd = text.lastIndexOf(". ", end);
      if (sentenceEnd > start + chunkSize * 0.8) {
        end = sentenceEnd + 1;
      } else {
        // Look for word boundary
        const wordEnd = text.lastIndexOf(" ", end);
        if (wordEnd > start + chunkSize * 0.8) {
          end = wordEnd;
        }
      }
    }

    const chunk = text.slice(start, end).trim();
    if (chunk) {
      chunks.push(chunk);
    }

    // Move start position with overlap
    start = end - overlap;

    // Prevent infinite loop
    if (start >= text.length - 1) break;
  }

  return chunks;
}

// Memory-efficient streaming text splitter for very large texts
function* splitTextIntoChunksGenerator(text, chunkSize = 1000, overlap = 100) {
  if (!text || typeof text !== "string") return;

  let start = 0;

  while (start < text.length) {
    let end = start + chunkSize;

    if (end < text.length) {
      const sentenceEnd = text.lastIndexOf(". ", end);
      if (sentenceEnd > start + chunkSize * 0.8) {
        end = sentenceEnd + 1;
      } else {
        const wordEnd = text.lastIndexOf(" ", end);
        if (wordEnd > start + chunkSize * 0.8) {
          end = wordEnd;
        }
      }
    }

    const chunk = text.slice(start, end).trim();
    if (chunk) {
      yield chunk;
    }

    start = end - overlap;
    if (start >= text.length - 1) break;
  }
}

module.exports = {
  splitTextIntoChunks,
  splitTextIntoChunksGenerator,
};
