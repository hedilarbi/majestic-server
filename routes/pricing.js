const express = require("express");

const {
  createPricing,
  listPricing,
  getPricing,
  updatePricing,
  deletePricing,
} = require("../controllers/pricingController");
const { requireDashboardPermission } = require("../middlewares/auth");

const router = express.Router();

router.get("/", requireDashboardPermission("pricing", "list"), listPricing);
router.get("/:id", requireDashboardPermission("pricing", "list"), getPricing);
router.post("/", requireDashboardPermission("pricing", "create"), createPricing);
router.put("/:id", requireDashboardPermission("pricing", "update"), updatePricing);
router.delete("/:id", requireDashboardPermission("pricing", "delete"), deletePricing);

module.exports = router;
