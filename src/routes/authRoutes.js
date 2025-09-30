// routes/auth.js
const express = require("express");
const { authenticateToken } = require("../middlewares/auth");

const router = express.Router();

const {
  register,
  login,
  addUser,
  me,
} = require("../controllers/authController");

router.post("/register", register);

router.post("/login", login);

router.post("/add-user", addUser);

router.get("/me", authenticateToken, me);

module.exports = router;
