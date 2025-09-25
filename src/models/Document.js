// models/Document.js
const mongoose = require("mongoose");
const { Schema } = mongoose;

const DocumentSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    uploadedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    filename: {
      type: String,
      required: [true, "Filename is required"],
      trim: true,
    },
    docType: {
      type: String,
      enum: ["pdf", "txt", "md"],
      required: [true, "Document type is required"],
    },
    status: {
      type: String,
      enum: ["active", "deleted"],
      default: "active",
    },
    chromaIds: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Document", DocumentSchema);
