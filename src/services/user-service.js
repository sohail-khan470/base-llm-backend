// services/userService.js
const bcrypt = require("bcrypt");
const User = require("../models/User");

class UserService {
  async create(userData) {
    const user = new User({
      ...userData,
    });

    return await user.save();
  }

  async verifyPassword(userId, password) {
    const user = await User.findById(userId);
    if (!user) return false;
    return bcrypt.compare(password, user.passwordHash);
  }

  async findById(id) {
    return await User.findById(id).populate("organizationId");
  }

  async findByEmail(email) {
    return await User.findOne({ email }).populate("organizationId");
  }

  async findByOrganization(organizationId) {
    return await User.find({ organizationId }).populate("organizationId");
  }

  async findAll({ page = 1, limit = 10, role, organizationId }) {
    const query = {};
    if (role) query.role = role;
    if (organizationId) query.organizationId = organizationId;

    const users = await User.find(query)
      .populate("organizationId")
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await User.countDocuments(query);

    return { users, total, page, pages: Math.ceil(total / limit) };
  }

  async update(id, updateData) {
    if (updateData.password) {
      const saltRounds = 10;
      updateData.passwordHash = await bcrypt.hash(
        updateData.password,
        saltRounds
      );
      delete updateData.password; // never store plain password
    }

    return await User.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    }).populate("organizationId");
  }

  async delete(id) {
    return await User.findByIdAndUpdate(
      id,
      { deletedAt: new Date() },
      { new: true }
    );
  }

  async restore(id) {
    return await User.findByIdAndUpdate(id, { deletedAt: null }, { new: true });
  }

  async updatePassword(id, password) {
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    return await User.findByIdAndUpdate(
      id,
      { passwordHash },
      { new: true, runValidators: true }
    );
  }

  async findAdminsByOrganization(organizationId) {
    return await User.find({ organizationId, role: "admin" }).populate(
      "organizationId"
    );
  }

  async isAdmin(userId) {
    const user = await User.findById(userId);
    return user?.role === "admin";
  }

  async exists(email) {
    const user = await User.findOne({ email });
    return !!user;
  }
}

module.exports = new UserService();
