// middleware/auth.js
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Organization = require("../models/Organization");

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";

// Authentication middleware - verify JWT token
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ error: "Access token required" });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    // Fetch user with organization details
    const user = await User.findById(decoded.userId).populate("organizationId");

    if (!user) {
      return res.status(401).json({ error: "Invalid token - user not found" });
    }

    // Attach user info to request
    req.user = user;
    req.organizationId = user.organizationId._id;
    req.userId = user._id;

    next();
  } catch (error) {
    console.error("Auth error:", error.message);
    return res.status(403).json({ error: "Invalid or expired token" });
  }
};

// Organization isolation middleware - ensure users can only access their org data
const requireOrganization = async (req, res, next) => {
  const organizationId = req.user.organizationId._id;
  console.log();
  try {
    // Check if organizationId is provided in request (for admin routes)
    const requestedOrgId = organizationId;
    console.log(requestedOrgId);

    // if (requestedOrgId && requestedOrgId !== req.organizationId.toString()) {
    //   return res.status(403).json({
    //     error: "Access denied - cannot access other organization's data",
    //   });
    // }

    next();
  } catch (error) {
    console.log(error);
    console.error("Organization check error:", error.message);
    return res.status(500).json({ error: "Authorization check failed" });
  }
};

// Admin role check middleware
const requireAdmin = (req, res, next) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({
      error: "Admin access required",
    });
  }
  next();
};

// Generate JWT token
const generateToken = (userId) => {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: "7d" });
};

// Verify token without middleware (for utility use)
const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
};

module.exports = {
  authenticateToken,
  requireOrganization,
  requireAdmin,
  generateToken,
  verifyToken,
};
