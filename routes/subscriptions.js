const express = require("express");

const {
  createSubscription,
  listSubscriptions,
  getSubscriptionById,
  updateSubscription,
  deleteSubscription,
} = require("../controllers/subscriptionController");
const { requireDashboardPermission } = require("../middlewares/auth");
const router = express.Router();

router.post(
  "/",
  requireDashboardPermission("subscriptions", "create"),
  createSubscription,
);
router.get("/", listSubscriptions);
router.get("/:id", getSubscriptionById);
router.patch(
  "/:id",
  requireDashboardPermission("subscriptions", "update"),
  updateSubscription,
);
router.delete(
  "/:id",
  requireDashboardPermission("subscriptions", "delete"),
  deleteSubscription,
);

module.exports = router;
