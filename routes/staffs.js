const express = require("express");

const {
  createStaff,
  createBootstrapSuperAdmin,
  loginStaff,
  getStaffMe,
  getStaffById,
  updateStaff,
  deleteStaff,
  toggleStaffStatus,
  listStaff,
  bootstrapPromoteAdminsToSuperAdmin,
} = require("../controllers/staffController");
const {
  authenticate,
  requireDashboardPermission,
} = require("../middlewares/auth");
const router = express.Router();

router.post("/login", loginStaff);
router.post("/bootstrap/create-super-admin", createBootstrapSuperAdmin);
router.post(
  "/bootstrap/promote-admins-to-super-admin",
  bootstrapPromoteAdminsToSuperAdmin,
);
router.get("/me", authenticate, getStaffMe);
router.post("/", requireDashboardPermission("staffs", "create"), createStaff);
router.get("/", requireDashboardPermission("staffs", "list"), listStaff);
router.get("/:id", requireDashboardPermission("staffs", "list"), getStaffById);
router.put("/:id", requireDashboardPermission("staffs", "update"), updateStaff);
router.delete(
  "/:id",
  requireDashboardPermission("staffs", "delete"),
  deleteStaff,
);
router.put(
  "/:id/toggle-status",
  requireDashboardPermission("staffs", "update"),
  toggleStaffStatus,
);

module.exports = router;
