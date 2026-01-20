// proxy-server.js - Alternative version (proxy everything)
const express = require("express");
const cors = require("cors");
const { createProxyMiddleware } = require("http-proxy-middleware");
const { PORT } = require("./src/config/server-config");
const morgan = require("morgan");

const app = express();

// CORS configuration
app.use(
  cors({
    origin: ["http://localhost:3008", "http://localhost:5173"],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  })
);

app.use(morgan("combined"));

// Proxy ALL routes to backend
app.use(
  "/",
  createProxyMiddleware({
    target: `http://localhost:${PORT}`,
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

const PROXY_PORT = 3007; // Run proxy on 3007, proxy to backend on PORT (3008)
app.listen(PROXY_PORT, "0.0.0.0", () => {
  console.log(`Proxy server running on http://localhost:${PROXY_PORT}`);
  console.log(`All routes are being proxied to backend on port ${PORT}`);
});
