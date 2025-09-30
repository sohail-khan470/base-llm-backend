// services/organizationService.js
const Organization = require("../models/Organization");

class OrganizationService {
  async create(organizationData) {
    const organization = new Organization(organizationData);
    return await organization.save();
  }

  async findById(id) {
    return await Organization.findById(id);
  }

  async findByEmail(email) {
    return await Organization.findOne({ email });
  }

  async findAll() {
    return await Organization.find();
  }

  async update(id, updateData) {
    return await Organization.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });
  }

  async delete(id) {
    return await Organization.findByIdAndDelete(id);
  }

  async exists(email) {
    const organization = await Organization.findOne({ email });
    return !!organization;
  }

  async findChatsByOrg(organizationId) {
    return await Organization.findById(organizationId).populate("chats");
  }
}

module.exports = new OrganizationService();
