const subscriptionSalesService = require("../services/subscriptionSalesService");

const listSubscriptionSales = async (req, res) => {
  try {
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({ message: "Acces admin requis" });
    }

    const result = await subscriptionSalesService.listSubscriptionSales({
      page: req.query.page,
      limit: req.query.limit,
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
    if (role !== "admin" && role !== "ticket_office" && role !== "customer") {
      return res.status(403).json({ message: "Acces refuse" });
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
  createSubscriptionSale,
};
