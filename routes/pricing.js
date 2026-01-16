const express = require("express");

const {
  createPricing,
  listPricing,
  getPricing,
  updatePricing,
  deletePricing,
} = require("../controllers/pricingController");
const { requireAdmin } = require("../middlewares/auth");

const router = express.Router();

router.use(requireAdmin);

router.post("/", createPricing);
router.get("/", listPricing);
router.get("/:id", getPricing);
router.put("/:id", updatePricing);
router.delete("/:id", deletePricing);

module.exports = router;
