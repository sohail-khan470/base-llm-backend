const organizationService = require("../services/organization-service");

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
}

module.exports = new OrganizationController();
