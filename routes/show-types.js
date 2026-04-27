const express = require("express");

const {
  createShowType,
  listShowTypes,
  getShowType,
  updateShowType,
  deleteShowType,
} = require("../controllers/showTypeController");
const { requireDashboardPermission } = require("../middlewares/auth");

const router = express.Router();

router.get("/", requireDashboardPermission("show_types", "list"), listShowTypes);
router.get("/:id", requireDashboardPermission("show_types", "list"), getShowType);

router.post(
  "/",
  requireDashboardPermission("show_types", "create"),
  createShowType,
);
router.put(
  "/:id",
  requireDashboardPermission("show_types", "update"),
  updateShowType,
);
router.delete(
  "/:id",
  requireDashboardPermission("show_types", "delete"),
  deleteShowType,
);

module.exports = router;
