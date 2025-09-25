// routes/auth.js
const express = require("express");

const router = express.Router();

const { register, login, addUser } = require("../controllers/authController");

router.post("/register", register);

router.post("/login", login);

router.post("/add-user", addUser);

module.exports = router;
