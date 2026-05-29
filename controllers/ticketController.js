const ticketService = require("../services/ticketService");
const { hasDashboardPermission } = require("../config/dashboardPermissions");

const listTickets = async (req, res) => {
  try {
    if (!hasDashboardPermission(req.user, "sales_tickets", "list")) {
      return res.status(403).json({ message: "Permission insuffisante" });
    }

    const result = await ticketService.listTickets({
      page: req.query.page,
      limit: req.query.limit
    });

    return res.status(200).json(result);
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ message: error.message || "Server error" });
  }
};

const scanTicket = async (req, res) => {
  try {
    const result = await ticketService.scanTicket({
      userId: req.user && req.user.sub,
      userRole: req.user && req.user.role,
      payload: req.body || {}
    });

    return res.status(200).json(result);
  } catch (error) {
    const status = error.status || 500;
    const response = { message: error.message || "Server error" };
    if (error.code) response.code = error.code;
    if (error.details) response.details = error.details;
    return res.status(status).json(response);
  }
};

const searchTicket = async (req, res) => {
  try {
    const result = await ticketService.searchTicket({ q: req.query.q });
    return res.status(200).json({ ticket: result });
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message || "Server error" });
  }
};

const repriceTicket = async (req, res) => {
  try {
    const result = await ticketService.repriceTicket({
      ticketId: req.params.ticketId,
      newPricingName: req.body?.newPricingName,
      paymentMethod: req.body?.paymentMethod || "cash",
      actorId: req.user?.sub,
    });
    return res.status(200).json(result);
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message || "Server error" });
  }
};

module.exports = {
  listTickets,
  scanTicket,
  searchTicket,
  repriceTicket,
};