const express = require("express");
const router = express.Router();
const organizationController = require("../controllers/organization-controller");

// Create organization
router.post("/", organizationController.create);

// Get all organizations
router.get("/", organizationController.findAll);

// Get organization by ID
router.get("/:id", organizationController.findById);

// Update organization
router.put("/:id", organizationController.update);

// Delete organization
router.delete("/:id", organizationController.delete);

module.exports = router;
