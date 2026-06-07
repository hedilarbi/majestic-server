const express = require("express");

const { createAdmin } = require("../controllers/adminController");
const {
  exportUsers,
  listUsers,
  getUserDetails,
  toggleUserStatus,
} = require("../controllers/adminUserController");
const { authenticate, requireSuperAdmin, requireDashboardPermission } = require("../middlewares/auth");
const router = express.Router();

router.post("/create", requireSuperAdmin, createAdmin);

// Admin routes
router.get("/", requireDashboardPermission("users", "list"), listUsers);
router.get("/export/:format", requireDashboardPermission("users", "list"), exportUsers);
router.get("/:userId", requireDashboardPermission("users", "list"), getUserDetails);
router.post("/:userId/toggle-status", requireDashboardPermission("users", "update"), toggleUserStatus);

module.exports = router;
