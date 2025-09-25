// services/documentService.js
const Document = require("../models/Document");

class DocumentService {
  async create(documentData) {
    const document = new Document(documentData);
    return await document.save();
  }

  async findById(id) {
    return await Document.findById(id)
      .populate("organizationId")
      .populate("uploadedBy");
  }

  async findByOrganization(organizationId, status = "active") {
    return await Document.find({ organizationId, status })
      .populate("organizationId")
      .populate("uploadedBy");
  }

  async findByUser(uploadedBy, status = "active") {
    return await Document.find({ uploadedBy, status })
      .populate("organizationId")
      .populate("uploadedBy");
  }

  async findByType(docType, organizationId, status = "active") {
    return await Document.find({ docType, organizationId, status })
      .populate("organizationId")
      .populate("uploadedBy");
  }

  async findAll() {
    return await Document.find()
      .populate("organizationId")
      .populate("uploadedBy");
  }

  async update(id, updateData) {
    return await Document.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    })
      .populate("organizationId")
      .populate("uploadedBy");
  }

  async delete(id) {
    return await Document.findByIdAndDelete(id);
  }

  async softDelete(id) {
    return await this.update(id, { status: "deleted" });
  }

  async addChromaId(id, chromaId) {
    return await Document.findByIdAndUpdate(
      id,
      { $push: { chromaIds: chromaId } },
      { new: true }
    );
  }

  async findByIdAndOrganization(docId, organizationId) {
    return await Document.findOne({
      _id: docId,
      organizationId: organizationId,
    });
  }

  async removeChromaId(id, chromaId) {
    return await Document.findByIdAndUpdate(
      id,
      { $pull: { chromaIds: chromaId } },
      { new: true }
    );
  }

  async findByChromaId(chromaId) {
    return await Document.findOne({ chromaIds: chromaId })
      .populate("organizationId")
      .populate("uploadedBy");
  }

  async findByOrganizationAndUser(userId, organizationId) {
    return await Document.find({
      uploadedBy: userId,
      organizationId: organizationId,
    })
      .populate("organizationId")
      .populate("uploadedBy");
  }
}

module.exports = new DocumentService();
