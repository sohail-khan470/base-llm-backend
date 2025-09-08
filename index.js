const express = require("express");
const { aiRoutes } = require("./src/routes");
const cors = require("cors");
const fileUpload = require("express-fileupload");

const app = express();
app.use(cors());
app.use(express.json());
app.use(fileUpload()); // Enable file uploads

// Routes
app.use("/api/ai", aiRoutes);

const PORT = process.env.PORT || 3008;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
