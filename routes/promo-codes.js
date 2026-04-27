const express = require("express");

const {
  createPromoCode,
  listPromoCodes,
  generatePromoCode,
  getPromoCode,
  updatePromoCode,
  deletePromoCode,
  setPromoCodeActive,
  validatePromoCodeForCheckout,
} = require("../controllers/promoCodeController");
const {
  authenticate,
  requireDashboardPermission,
} = require("../middlewares/auth");

const router = express.Router();

router.get("/", requireDashboardPermission("promo_codes", "list"), listPromoCodes);
router.get(
  "/generate",
  requireDashboardPermission("promo_codes", "create"),
  generatePromoCode,
);
router.post("/validate", authenticate, validatePromoCodeForCheckout);
router.get("/:id", requireDashboardPermission("promo_codes", "list"), getPromoCode);
router.post("/", requireDashboardPermission("promo_codes", "create"), createPromoCode);
router.put("/:id", requireDashboardPermission("promo_codes", "update"), updatePromoCode);
router.patch(
  "/:id/active",
  requireDashboardPermission("promo_codes", "update"),
  setPromoCodeActive,
);
router.delete(
  "/:id",
  requireDashboardPermission("promo_codes", "delete"),
  deletePromoCode,
);

module.exports = router;
