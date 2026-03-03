const express = require("express");
const {
  listSubscriptionSales,
  createSubscriptionSale,
} = require("../controllers/subscriptionSalesController");
const { authenticate } = require("../middlewares/auth");

const router = express.Router();

router.get("/", authenticate, listSubscriptionSales);
router.post("/", authenticate, createSubscriptionSale);

module.exports = router;
