const express = require("express");

const {
  createPromoCode,
  listPromoCodes,
  getPromoCode,
  updatePromoCode,
  deletePromoCode,
  setPromoCodeActive,
  validatePromoCodeForCheckout,
} = require("../controllers/promoCodeController");
const { authenticate, requireAdmin } = require("../middlewares/auth");

const router = express.Router();

router.get("/", listPromoCodes);
router.post("/validate", authenticate, validatePromoCodeForCheckout);
router.get("/:id", getPromoCode);
router.post("/", requireAdmin, createPromoCode);
router.put("/:id", requireAdmin, updatePromoCode);
router.patch("/:id/active", requireAdmin, setPromoCodeActive);
router.delete("/:id", requireAdmin, deletePromoCode);

module.exports = router;
