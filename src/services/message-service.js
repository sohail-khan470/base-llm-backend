// services/messageService.js
const Message = require("../models/Message");

class MessageService {
  async create(messageData) {
    const message = new Message(messageData);
    return await message.save();
  }

  async findById(id) {
    return await Message.findById(id).populate("chatId");
  }

  async findByChat(chatId) {
    return await Message.find({ chatId })
      .populate("chatId")
      .sort({ timestamp: 1 });
  }

  async findByRole(chatId, role) {
    return await Message.find({ chatId, role })
      .populate("chatId")
      .sort({ timestamp: 1 });
  }

  async findAll() {
    return await Message.find().populate("chatId").sort({ timestamp: -1 });
  }

  async update(id, updateData) {
    return await Message.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    }).populate("chatId");
  }

  async delete(id) {
    return await Message.findByIdAndDelete(id);
  }

  async deleteByChatId(chatId) {
    return await Message.deleteMany({ chatId });
  }

  async getLatestMessage(chatId) {
    return await Message.findOne({ chatId })
      .populate("chatId")
      .sort({ timestamp: -1 });
  }

  async getMessageCount(chatId) {
    return await Message.countDocuments({ chatId });
  }

  async getMessagesByTimeRange(chatId, startDate, endDate) {
    return await Message.find({
      chatId,
      timestamp: {
        $gte: startDate,
        $lte: endDate,
      },
    })
      .populate("chatId")
      .sort({ timestamp: 1 });
  }

  async searchMessages(chatId, searchTerm) {
    return await Message.find({
      chatId,
      content: { $regex: searchTerm, $options: "i" },
    })
      .populate("chatId")
      .sort({ timestamp: -1 });
  }
}

module.exports = new MessageService();
