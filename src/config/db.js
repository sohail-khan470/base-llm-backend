// db.js
const mongoose = require("mongoose");
const { MONGO_URI } = require("./server-config");

// Optional: Mongoose config options
const options = {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  // useCreateIndex: true,   // no longer needed in Mongoose 6+
  // useFindAndModify: false // deprecated, removed in v6
};

// Function to connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(MONGO_URI, options);
    console.log("MongoDB connected successfully!");
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
    process.exit(1); // Exit process with failure
  }
};

// Export connection function & mongoose instance
module.exports = {
  connectDB,
};
