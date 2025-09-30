const chatService = require("../services/chat-service");

class ChatController {
  // Create a new chat
  async createChat(req, res) {
    try {
      const { organizationId, userId, title } = req.body;

      if (!organizationId || !userId) {
        return res.status(400).json({
          success: false,
          message: "Organization ID and User ID are required",
        });
      }

      const chatData = {
        organizationId,
        userId,
        title: title || "New Chat",
      };

      const chat = await chatService.create(chatData);

      res.status(201).json({
        success: true,
        message: "Chat created successfully",
        data: chat,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Get all chats for an organization
  async getOrganizationChats(req, res) {
    try {
      const { organizationId } = req.params;

      const chats = await chatService.findByOrganization(organizationId);

      res.status(200).json({
        success: true,
        data: chats,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Get chat by ID
  async getChatById(req, res) {
    try {
      const { id } = req.params;
      const { populateMessages } = req.query;

      const chat = await chatService.findById(id, populateMessages === "true");

      if (!chat) {
        return res.status(404).json({
          success: false,
          message: "Chat not found",
        });
      }

      res.status(200).json({
        success: true,
        data: chat,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Get chat by ID with user and organization validation
  async getChatByIdAndUser(req, res) {
    try {
      const { chatId } = req.params;
      const { userId, organizationId } = req.query;

      if (!userId || !organizationId) {
        return res.status(400).json({
          success: false,
          message: "User ID and Organization ID are required",
        });
      }

      const chat = await chatService.findByIdAndUser(
        chatId,
        userId,
        organizationId
      );

      if (!chat) {
        return res.status(404).json({
          success: false,
          message: "Chat not found or access denied",
        });
      }

      res.status(200).json({
        success: true,
        data: chat,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Get all chats for a user
  async getUserChats(req, res) {
    try {
      const { userId } = req.params;

      const chats = await chatService.findByUser(userId);

      res.status(200).json({
        success: true,
        data: chats,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Get chats by user and organization
  async getUserOrganizationChats(req, res) {
    console.log("&&&&&&&&&&&&&&&&&&");
    try {
      const { userId, organizationId } = req.params;

      const chats = await chatService.findByUserAndOrganization(
        userId,
        organizationId
      );

      res.status(200).json({
        success: true,
        data: chats,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Get all chats (admin only)
  async getAllChats(req, res) {
    try {
      const chats = await chatService.findAll();

      res.status(200).json({
        success: true,
        data: chats,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Update chat
  async updateChat(req, res) {
    try {
      const { id } = req.params;
      const updateData = req.body;

      const chat = await chatService.update(id, updateData);

      if (!chat) {
        return res.status(404).json({
          success: false,
          message: "Chat not found",
        });
      }

      res.status(200).json({
        success: true,
        message: "Chat updated successfully",
        data: chat,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Update chat title
  async updateChatTitle(req, res) {
    try {
      const { id } = req.params;
      const { title } = req.body;

      if (!title) {
        return res.status(400).json({
          success: false,
          message: "Title is required",
        });
      }

      const chat = await chatService.updateTitle(id, title);

      if (!chat) {
        return res.status(404).json({
          success: false,
          message: "Chat not found",
        });
      }

      res.status(200).json({
        success: true,
        message: "Chat title updated successfully",
        data: chat,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Delete chat
  async deleteChat(req, res) {
    try {
      const { id } = req.params;

      const chat = await chatService.delete(id);

      if (!chat) {
        return res.status(404).json({
          success: false,
          message: "Chat not found",
        });
      }

      res.status(200).json({
        success: true,
        message: "Chat deleted successfully",
        data: chat,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Add message to chat
  async addMessageToChat(req, res) {
    try {
      const { id } = req.params;
      const { messageId } = req.body;

      if (!messageId) {
        return res.status(400).json({
          success: false,
          message: "Message ID is required",
        });
      }

      const chat = await chatService.addMessage(id, messageId);

      if (!chat) {
        return res.status(404).json({
          success: false,
          message: "Chat not found",
        });
      }

      res.status(200).json({
        success: true,
        message: "Message added to chat successfully",
        data: chat,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Remove message from chat
  async removeMessageFromChat(req, res) {
    try {
      const { id } = req.params;
      const { messageId } = req.body;

      if (!messageId) {
        return res.status(400).json({
          success: false,
          message: "Message ID is required",
        });
      }

      const chat = await chatService.removeMessage(id, messageId);

      if (!chat) {
        return res.status(404).json({
          success: false,
          message: "Chat not found",
        });
      }

      res.status(200).json({
        success: true,
        message: "Message removed from chat successfully",
        data: chat,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Get recent chats for a user
  async getRecentChats(req, res) {
    try {
      const { userId } = req.params;
      const { limit = 10 } = req.query;

      const chats = await chatService.getRecentChats(userId, parseInt(limit));

      res.status(200).json({
        success: true,
        data: chats,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
}

module.exports = new ChatController();
