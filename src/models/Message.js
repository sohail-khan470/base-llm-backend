// models/Message.js
const mongoose = require("mongoose");
const { Schema } = mongoose;

const MessageSchema = new Schema(
  {
    chatId: {
      type: Schema.Types.ObjectId,
      ref: "Chat",
      required: true,
    },
    role: {
      type: String,
      enum: ["user", "assistant", "system"],
      required: [true, "Role is required"],
    },
    content: {
      type: String,
      required: [true, "Message content is required"],
      trim: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: false }
);

module.exports = mongoose.model("Message", MessageSchema);
