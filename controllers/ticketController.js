const ticketService = require("../services/ticketService");
const { hasDashboardPermission } = require("../config/dashboardPermissions");
const {
  formatCurrency,
  formatDate,
  formatDateTime,
  sendTabularExport,
} = require("../services/exportService");

const listTickets = async (req, res) => {
  try {
    if (!hasDashboardPermission(req.user, "sales_tickets", "list")) {
      return res.status(403).json({ message: "Permission insuffisante" });
    }

    const result = await ticketService.listTickets({
      page: req.query.page,
      limit: req.query.limit,
      dateFrom: req.query.dateFrom || req.query.from,
      dateTo: req.query.dateTo || req.query.to,
      status: req.query.status,
      pricingName: req.query.pricingName,
    });

    return res.status(200).json(result);
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ message: error.message || "Server error" });
  }
};

const formatSeat = (seat) => {
  if (!seat) {
    return "";
  }
  return `${seat.row || ""}${seat.col ?? ""}`;
};

const formatSession = (session) => {
  if (!session) {
    return "";
  }
  const eventName = session.event?.name || "Séance";
  const date = formatDate(session.date);
  return `${eventName}${date ? ` - ${date}` : ""}${session.sessionTime ? ` ${session.sessionTime}` : ""}`;
};

const exportTickets = async (req, res) => {
  try {
    if (!hasDashboardPermission(req.user, "sales_tickets", "list")) {
      return res.status(403).json({ message: "Permission insuffisante" });
    }

    const items = await ticketService.listTicketsForExport({
      dateFrom: req.query.dateFrom || req.query.from,
      dateTo: req.query.dateTo || req.query.to,
      status: req.query.status,
      pricingName: req.query.pricingName,
    });

    await sendTabularExport({
      res,
      format: req.params.format,
      baseFilename: "billets",
      title: "Billets",
      filters: [
        { label: "Date début", value: req.query.dateFrom || req.query.from },
        { label: "Date fin", value: req.query.dateTo || req.query.to },
        { label: "Statut", value: req.query.status },
        { label: "Tarif", value: req.query.pricingName },
      ],
      columns: [
        { key: "code", label: "Code", value: (item) => item.code || "" },
        { key: "booking", label: "Booking", value: (item) => item.booking?.bookingNumber || "" },
        { key: "session", label: "Séance", value: (item) => formatSession(item.session) },
        { key: "seat", label: "Siège", value: (item) => formatSeat(item.seat) },
        { key: "pricingName", label: "Tarif", value: (item) => item.pricingName || "" },
        { key: "price", label: "Prix", value: (item) => formatCurrency(item.price) },
        { key: "status", label: "Statut", value: (item) => item.status || "" },
        { key: "createdAt", label: "Date", value: (item) => formatDateTime(item.createdAt) },
      ],
      rows: items,
    });
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
  exportTickets,
  scanTicket,
  searchTicket,
  repriceTicket,
};
