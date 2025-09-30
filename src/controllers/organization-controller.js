const organizationService = require("../services/organization-service");
const chatService = require("../services/chat-service");

class OrganizationController {
  async create(req, res) {
    try {
      const organization = await organizationService.create(req.body);
      res.status(201).json(organization);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }

  async findById(req, res) {
    try {
      const organization = await organizationService.findById(req.params.id);
      if (!organization) {
        return res.status(404).json({ error: "Organization not found" });
      }
      res.json(organization);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }

  async findAll(req, res) {
    try {
      const organizations = await organizationService.findAll();
      res.json(organizations);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  async update(req, res) {
    try {
      const organization = await organizationService.update(
        req.params.id,
        req.body
      );
      if (!organization) {
        return res.status(404).json({ error: "Organization not found" });
      }
      res.json(organization);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }

  async delete(req, res) {
    try {
      const organization = await organizationService.delete(req.params.id);
      if (!organization) {
        return res.status(404).json({ error: "Organization not found" });
      }
      res.json({ message: "Organization deleted successfully" });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  async getChatsByOrg(req, res) {
    try {
      const organizationId = req.params.id;

      const organization = await organizationService.findById(organizationId);
      if (!organization) {
        return res.status(404).json({ error: "Organization not found" });
      }

      const chats = await chatService.findByOrganization(organizationId);

      return res.status(200).json(chats);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = new OrganizationController();
