const { generateToken } = require("../middlewares/auth");
const User = require("../models/User");
const organizationService = require("../services/organization-service");
const userService = require("../services/user-service");
const bcrypt = require("bcryptjs");

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: "Email and password are required",
      });
    }

    // Find user with organization details
    const user = await userService.findByEmail(email);
    if (!user) {
      return res.status(401).json({
        error: "Invalid credentials",
      });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      return res.status(401).json({
        error: "Invalid credentials",
      });
    }

    // Generate token
    const token = generateToken(user._id);

    res.json({
      message: "Login successful",
      token,
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        organization: {
          id: user.organizationId._id,
          name: user.organizationId.name,
          email: user.organizationId.email,
        },
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      error: "Login failed",
      details: error.message,
    });
  }
};

const addUser = async (req, res) => {
  try {
    const { email, password, role = "member" } = req.body;
    const organizationId = req.body.organizationId;

    if (!email || !password || !organizationId) {
      return res.status(400).json({
        error: "Email, password, and organization ID are required",
      });
    }

    // Verify organization exists
    const organization = await organizationService.findById(organizationId);
    if (!organization) {
      return res.status(404).json({
        error: "Organization not found",
      });
    }

    // Check if user already exists
    const existingUser = await userService.findByEmail(email);
    if (existingUser) {
      return res.status(409).json({
        error: "User with this email already exists",
      });
    }

    // Hash password and create user
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await userService.create({
      email,
      passwordHash,
      organizationId,
      role,
    });

    res.status(201).json({
      message: "User created successfully",
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        organization: {
          id: organization._id,
          name: organization.name,
          email: organization.email,
        },
      },
    });
  } catch (error) {
    console.error("Add user error:", error);
    res.status(500).json({
      error: "Failed to add user",
      details: error.message,
    });
  }
};

const register = async (req, res) => {
  try {
    const { email, password, organizationId } = req.body;

    // Validation
    if (!email || !password || !organizationId) {
      return res.status(400).json({ error: "All fields are required" });
    }

    // Check if organization exists
    const existingOrg = await organizationService.findById(organizationId);

    if (!existingOrg) {
      return res.status(404).json({ error: "Organization not found" });
    }

    // Check if user already exists
    const existingUser = await userService.findByEmail(email);
    if (existingUser) {
      return res
        .status(409)
        .json({ error: "User with this email already exists" });
    }

    // Hash password and create user
    const passwordHash = await bcrypt.hash(password, 12);

    const user = await userService.create({
      email,
      passwordHash,
      organizationId,
    });

    // Populate organization details
    await user.populate("organizationId");

    // Generate token
    const token = generateToken(user._id);

    res.status(201).json({
      message: "User created successfully",
      token,
      user: {
        id: user._id,
        email: user.email,
        organization: user.organizationId, // populated org doc
      },
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({
      error: "Registration failed",
      details: error.message,
    });
  }
};

const me = async (req, res) => {
  try {
    // The user is already attached to req by authenticateToken middleware
    const user = req.user;

    res.json({
      message: "User data retrieved successfully",
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        organization: {
          id: user.organizationId._id,
          name: user.organizationId.name,
          email: user.organizationId.email,
        },
      },
    });
  } catch (error) {
    console.error("Get user data error:", error);
    res.status(500).json({
      error: "Failed to get user data",
      details: error.message,
    });
  }
};

module.exports = {
  register,
  login,
  addUser,
  me,
};
