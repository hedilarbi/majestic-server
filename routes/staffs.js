const express = require("express");

const {
  createStaff,
  loginStaff,
  getStaffMe,
  getStaffById,
  updateStaff,
  deleteStaff,
  toggleStaffStatus,
  listStaff,
} = require("../controllers/staffController");
const { authenticate, requireAdmin } = require("../middlewares/auth");
const router = express.Router();

router.post("/", createStaff);
router.post("/login", loginStaff);
router.get("/me", authenticate, getStaffMe);
router.get("/", requireAdmin, listStaff);
router.get("/:id", requireAdmin, getStaffById);
router.put("/:id", requireAdmin, updateStaff);
router.delete("/:id", requireAdmin, deleteStaff);
router.put("/:id/toggle-status", requireAdmin, toggleStaffStatus);

module.exports = router;
