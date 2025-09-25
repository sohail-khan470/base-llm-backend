// models/Organization.js
const mongoose = require("mongoose");
const { Schema } = mongoose;

const OrganizationSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, "Organization name is required"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please provide a valid email"],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Organization", OrganizationSchema);
