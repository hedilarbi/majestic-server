const ticketService = require("../services/ticketService");

const listTickets = async (req, res) => {
  try {
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({ message: "Acces admin requis" });
    }

    const result = await ticketService.listTickets({
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

const scanTicket = async (req, res) => {
  try {
    const result = await ticketService.scanTicket({
      userId: req.user && req.user.sub,
      userRole: req.user && req.user.role,
      payload: req.body || {},
    });

    return res.status(200).json(result);
  } catch (error) {
    const status = error.status || 500;
    const response = { message: error.message || "Server error" };
    if (error.code) {
      response.code = error.code;
    }
    if (error.details) {
      response.details = error.details;
    }
    return res.status(status).json(response);
  }
};

module.exports = {
  listTickets,
  scanTicket,
};
