const axios = require("axios");

const DEFAULT_MODEL = "phi3:latest";
const MAX_TOKENS = 2000;

const streamAIResponse = (prompt, onData, onDone = () => {}) => {
  return new Promise((resolve, reject) => {
    // Use the correct endpoint - /api/generate is the standard one
    axios
      .post(
        "http://localhost:11434/api/generate", // Changed to correct endpoint
        {
          model: DEFAULT_MODEL,
          prompt: prompt, // Changed from messages to prompt
          stream: true,
          options: {
            num_predict: MAX_TOKENS,
          },
        },
        { responseType: "stream" }
      )
      .then((responseStream) => {
        let isDone = false;
        let fullResponse = "";

        responseStream.data.on("data", (chunk) => {
          const lines = chunk.toString().split("\n").filter(Boolean);

          for (const line of lines) {
            try {
              const data = JSON.parse(line);

              // Different response format for /api/generate
              if (data.response) {
                onData(data.response);
                fullResponse += data.response;
              }

              if (data.done) {
                isDone = true;
                onDone(fullResponse);
                resolve(fullResponse);
              }
            } catch (err) {
              console.error("Parse error:", err.message);
            }
          }
        });

        responseStream.data.on("end", () => {
          if (!isDone) {
            console.warn("Stream ended without 'done: true'");
          }
          onDone(fullResponse);
          resolve(fullResponse);
        });

        responseStream.data.on("error", (err) => {
          console.error("Stream error:", err.message);
          onDone(fullResponse);
          reject(err);
        });
      })
      .catch((err) => {
        console.error("❌ AI Service Error:", err.message);

        // Provide more detailed error information
        if (err.response) {
          console.error("Status:", err.response.status);
          console.error("Response data:", err.response.data);
        }

        onDone();
        reject(err);
      });
  });
};

module.exports = { streamAIResponse };
