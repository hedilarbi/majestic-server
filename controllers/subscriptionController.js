const subscriptionService = require("../services/subscriptionService");

const createSubscription = async (req, res) => {
  try {
    const subscription = await subscriptionService.createSubscription(
      req.body || {},
    );
    return res.status(201).json({ subscription });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ message: error.message || "Server error" });
  }
};

const listSubscriptions = async (req, res) => {
  try {
    const subscriptions = await subscriptionService.listSubscriptions();
    return res.status(200).json({ subscriptions });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ message: error.message || "Server error" });
  }
};

const getSubscriptionById = async (req, res) => {
  try {
    const subscription = await subscriptionService.getSubscriptionById(
      req.params.id,
    );
    return res.status(200).json({ subscription });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ message: error.message || "Server error" });
  }
};

const updateSubscription = async (req, res) => {
  try {
    const subscription = await subscriptionService.updateSubscription(
      req.params.id,
      req.body || {},
    );
    return res.status(200).json({ subscription });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ message: error.message || "Server error" });
  }
};

const deleteSubscription = async (req, res) => {
  try {
    const subscription = await subscriptionService.deleteSubscription(
      req.params.id,
    );
    return res.status(200).json({ subscription });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ message: error.message || "Server error" });
  }
};

module.exports = {
  createSubscription,
  listSubscriptions,
  getSubscriptionById,
  updateSubscription,
  deleteSubscription,
};
