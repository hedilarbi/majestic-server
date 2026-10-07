const express = require("express");
const {
  listSubscriptionSales,
  exportSubscriptionSales,
  listMySubscriptionSales,
  createSubscriptionSale,
  getSubscriptionScanChannel,
  scanSubscriptionSale,
} = require("../controllers/subscriptionSalesController");
const { authenticate } = require("../middlewares/auth");

const router = express.Router();

router.get("/scan-channel", authenticate, getSubscriptionScanChannel);
router.post("/scan", authenticate, scanSubscriptionSale);
router.get("/me", authenticate, listMySubscriptionSales);
router.get("/export/:format", authenticate, exportSubscriptionSales);
router.get("/", authenticate, listSubscriptionSales);
router.post("/", authenticate, createSubscriptionSale);

module.exports = router;
