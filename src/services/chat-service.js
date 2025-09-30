const Chat = require("../models/Chat");
const mongoose = require("mongoose");
const { ObjectId } = mongoose.Types;

class ChatService {
  async create(chatData) {
    const chat = new Chat(chatData);
    return await chat.save();
  }

  async findAll(organizationId) {
    const chats = await Chat.find({ _id: organizationId }).populate(
      "organizationId"
    );

    return chats;
  }

  async findById(id, populateMessages = false) {
    let query = Chat.findById(id).populate("organizationId").populate("userId");

    if (populateMessages) {
      query = query.populate("messages");
    }

    return await query;
  }
  // in chat-service.js
  async findByIdAndUser(chatId, userId, organizationId) {
    console.log("**********");
    return Chat.findOne({ _id: chatId, userId, organizationId });
  }

  async findByUser(userId) {
    return await Chat.find({ userId })
      .populate("organizationId")
      .populate("userId")
      .populate("messages")
      .sort({ updatedAt: -1 });
  }

  async findByOrganization(organizationId) {
    return await Chat.find({ organizationId })
      .populate("organizationId")
      .populate("userId")
      .populate("messages")
      .sort({ updatedAt: -1 });
  }

  async findAll() {
    return await Chat.find()
      .populate("organizationId")
      .populate("userId")
      .populate("messages")
      .sort({ updatedAt: -1 });
  }

  async update(id, updateData) {
    return await Chat.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    })
      .populate("organizationId")
      .populate("userId")
      .populate("messages"); // include messages
  }

  async delete(id) {
    return await Chat.findByIdAndDelete(id);
  }

  async addMessage(chatId, messageId) {
    return await Chat.findByIdAndUpdate(
      chatId,
      { $push: { messages: messageId } },
      { new: true }
    )
      .populate("organizationId")
      .populate("userId")
      .populate("messages");
  }

  async removeMessage(chatId, messageId) {
    return await Chat.findByIdAndUpdate(
      chatId,
      { $pull: { messages: messageId } },
      { new: true }
    )
      .populate("organizationId")
      .populate("userId")
      .populate("messages");
  }

  async getRecentChats(userId, limit = 10) {
    return await Chat.find({ userId })
      .populate("organizationId")
      .populate("userId")
      .populate("messages")
      .limit(limit)
      .sort({ updatedAt: -1 });
  }

  async updateTitle(id, title) {
    return await this.update(id, { title });
  }

  async findByUserAndOrganization(userId, organizationId) {
    try {
      return await Chat.find({
        userId,
        organizationId,
      })
        .populate("userId")
        .populate("organizationId")
        .populate("messages")
        .sort({ updatedAt: -1 }); // optional: newest first
    } catch (err) {
      throw new Error("Error fetching chats: " + err.message);
    }
  }

  async findByIdAndUser(chatId, userId, organizationId) {
    try {
      console.log(chatId, userId, organizationId);
      const chat = await Chat.findOne({
        _id: chatId,
        userId,
        organizationId,
      })
        .populate("organizationId")
        .populate("userId")
        .populate("messages")
        .exec();
      console.log(chat);
      return chat;
    } catch (error) {
      console.log(error);
    }
  }
}

module.exports = new ChatService();
