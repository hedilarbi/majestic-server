const subscriptionSalesService = require("../services/subscriptionSalesService");
const {
  hasDashboardPermission,
  isDashboardStaffRole,
} = require("../config/dashboardPermissions");

const listSubscriptionSales = async (req, res) => {
  try {
    if (!hasDashboardPermission(req.user, "sales_subscriptions", "list")) {
      return res.status(403).json({ message: "Permission insuffisante" });
    }

    const result = await subscriptionSalesService.listSubscriptionSales({
      page: req.query.page,
      limit: req.query.limit,
      dateFrom: req.query.dateFrom || req.query.from,
      dateTo: req.query.dateTo || req.query.to,
    });

    return res.status(200).json(result);
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
  }
};

const listMySubscriptionSales = async (req, res) => {
  try {
    const role = req.user && req.user.role;
    if (
      role !== "ticket_office" &&
      !(
        isDashboardStaffRole(role) &&
        hasDashboardPermission(req.user, "sales_subscriptions", "list")
      )
    ) {
      return res.status(403).json({ message: "Accès guichet requis" });
    }

    const result = await subscriptionSalesService.listSubscriptionSalesForUser({
      userId: req.user && req.user.sub,
      page: req.query.page,
      limit: req.query.limit,
      dateFrom: req.query.dateFrom || req.query.from,
      dateTo: req.query.dateTo || req.query.to,
    });

    return res.status(200).json(result);
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
  }
};

const createSubscriptionSale = async (req, res) => {
  try {
    const role = req.user && req.user.role;
    if (
      role !== "ticket_office" &&
      role !== "customer" &&
      !isDashboardStaffRole(role)
    ) {
      return res.status(403).json({ message: "Accès refuse" });
    }

    const result = await subscriptionSalesService.createSubscriptionSale({
      payload: req.body || {},
      userId: req.user && req.user.sub,
      userRole: role,
    });

    return res.status(201).json(result);
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
  }
};

module.exports = {
  listSubscriptionSales,
  listMySubscriptionSales,
  createSubscriptionSale,
};
