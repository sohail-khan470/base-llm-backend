// backend-server.js
const express = require("express");
const cors = require("cors");
const { aiRoutes, authRoutes } = require("./src/routes");
const organizationRoutes = require("./src/routes/organizationRoutes");
const chatRoutes = require("./src/routes/chatRoutes");
const { connectDB } = require("./src/config/db");
const { PORT } = require("./src/config/server-config");
const morgan = require("morgan");

const app = express();

// CORS configuration
app.use(
  cors({
    origin: [
      "http://localhost:3008",
      "http://localhost:5173",
      "http://localhost:3009",
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  })
);

app.use(express.json());
connectDB();
app.use(morgan("dev"));

// Actual route handlers
app.use("/api/auth", authRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/ai/organizations", organizationRoutes);
app.use("/api/ai/chats", chatRoutes);

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({
    status: "Backend server is running",
    timestamp: new Date().toISOString(),
  });
});

app.use((err, req, res, next) => {
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Actual backend running on http://localhost:${PORT}`);
});
