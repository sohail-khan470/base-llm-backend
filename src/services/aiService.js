const axios = require("axios");

const DEFAULT_MODEL = "deepseek-coder:1.3b";
const MAX_TOKENS = 2000;

const streamAIResponse = (prompt, onData, onDone = () => {}) => {
  return new Promise((resolve, reject) => {
    axios
      .post(
        "http://localhost:11434/api/generate",
        {
          model: DEFAULT_MODEL,
          prompt,
          stream: true, // Explicitly enable streaming (default is true, but good to set)
          options: {
            num_predict: MAX_TOKENS, // Correct way to limit tokens
          },
        },
        { responseType: "stream" }
      )
      .then((responseStream) => {
        let isDone = false;

        responseStream.data.on("data", (chunk) => {
          const lines = chunk.toString().split("\n").filter(Boolean);

          for (const line of lines) {
            try {
              const data = JSON.parse(line);
              if (data.response) {
                onData(data.response); // Send chunk to callback
              }
              if (data.done) {
                isDone = true;
                onDone(); // Optional custom done callback
                resolve();
              }
            } catch (err) {
              console.error("Parse error:", err.message);
            }
          }
        });

        responseStream.data.on("end", () => {
          if (!isDone) {
            console.warn("Stream ended without 'done: true' signal");
          }
          onDone(); // Optional
          resolve();
        });

        responseStream.data.on("error", (err) => {
          console.error("Stream error:", err.message);
          onDone(); // Optional
          reject(err);
        });
      })
      .catch((err) => {
        console.error("❌ AI Service Error:", err.message);
        onDone(); // Optional
        reject(err);
      });
  });
};

module.exports = { streamAIResponse };
