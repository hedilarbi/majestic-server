const express = require("express");

const {
  getStatistics,
  downloadSessionSalesPdf,
} = require("../controllers/statisticsController");
const { requireDashboardPermission } = require("../middlewares/auth");

const router = express.Router();

router.get(
  "/session-sales/pdf",
  requireDashboardPermission("statistics", "list"),
  downloadSessionSalesPdf,
);
router.get("/", requireDashboardPermission("statistics", "list"), getStatistics);

module.exports = router;
