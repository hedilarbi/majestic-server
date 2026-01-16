const express = require("express");

const {
  createStaff,
  loginStaff,
  getStaffMe,
} = require("../controllers/staffController");
const { authenticate } = require("../middlewares/auth");
const router = express.Router();

router.post("/create", createStaff);
router.post("/login", loginStaff);
router.get("/me", authenticate, getStaffMe);

module.exports = router;
