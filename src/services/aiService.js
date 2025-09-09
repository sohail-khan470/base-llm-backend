const axios = require("axios");

const DEFAULT_MODEL = "phi3:latest";
const MAX_TOKENS = 2000;

const streamAIResponse = (
  prompt,
  onData,
  onDone = () => {},
  reqAbortSignal
) => {
  return new Promise((resolve, reject) => {
    axios
      .post(
        "http://localhost:11434/api/generate",
        {
          model: DEFAULT_MODEL,
          prompt,
          stream: true,
          options: { num_predict: MAX_TOKENS },
        },
        {
          responseType: "stream",
          signal: reqAbortSignal, // ✅ cancellation support
        }
      )
      .then((responseStream) => {
        let isDone = false;
        let fullResponse = "";

        responseStream.data.on("data", (chunk) => {
          const lines = chunk.toString().split("\n").filter(Boolean);
          for (const line of lines) {
            try {
              const data = JSON.parse(line);
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
        onDone();
        reject(err);
      });
  });
};

module.exports = { streamAIResponse };
