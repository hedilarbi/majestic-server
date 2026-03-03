const express = require("express");

const {
  createSubscription,
  listSubscriptions,
  getSubscriptionById,
  updateSubscription,
  deleteSubscription,
} = require("../controllers/subscriptionController");
const { requireAdmin } = require("../middlewares/auth");
const router = express.Router();

router.post("/", requireAdmin, createSubscription);
router.get("/", listSubscriptions);
router.get("/:id", getSubscriptionById);
router.patch("/:id", requireAdmin, updateSubscription);
router.delete("/:id", requireAdmin, deleteSubscription);

module.exports = router;
