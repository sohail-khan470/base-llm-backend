// proxy-server.js - Alternative version (proxy everything)
const express = require("express");
const cors = require("cors");
const { createProxyMiddleware } = require("http-proxy-middleware");
const morgan = require("morgan");

const app = express();

// Enhanced CORS for Tailscale
app.use(
  cors({
    origin: [
      "https://desktop-vbrb5c9.tail0d77c7.ts.net:3008",
      "https://desktop-vbrb5c9.tail0d77c7.ts.net",
      "http://localhost:3008",
      "http://localhost:5173",
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  })
);

app.use(morgan("combined"));

// Proxy ALL routes to backend
app.use(
  "/",
  createProxyMiddleware({
    target: "http://localhost:3009",
    changeOrigin: true,
    onProxyReq: (proxyReq, req, res) => {
      console.log(
        "Proxying request:",
        req.method,
        req.url,
        "->",
        proxyReq.path
      );
    },
  })
);

const PORT = 3008;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Proxy server running on http://localhost:${PORT}`);
  console.log(`All routes are being proxied to backend on port 3009`);
});
