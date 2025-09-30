const express = require("express");
const { aiRoutes, authRoutes } = require("./src/routes");
const cors = require("cors");
const fileUpload = require("express-fileupload");
const organizationRoutes = require("./src/routes/organizationRoutes");
const chatRoutes = require("./src/routes/chatRoutes");
const { connectDB } = require("./src/config/db");

const app = express();
app.use(
  cors({
    origin: "http://localhost:5173", // frontend origin
    credentials: true, // allow cookies/auth headers
  })
);
app.use(express.json());
app.use(fileUpload()); // Enable file uploads

// Routes

// db connection
connectDB();

app.use("/api/auth", authRoutes);

app.use("/api/ai", aiRoutes);
app.use("/api/ai/organizations", organizationRoutes);
app.use("/api/ai/chats", chatRoutes);

const PORT = process.env.PORT || 3008;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
