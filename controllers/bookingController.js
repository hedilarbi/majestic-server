const bookingService = require("../services/bookingService");
const {
  formatCurrency,
  formatDate,
  formatDateTime,
  sendTabularExport,
} = require("../services/exportService");
const {
  hasDashboardPermission,
  isDashboardStaffRole,
} = require("../config/dashboardPermissions");

const listBookings = async (req, res) => {
  try {
    if (!hasDashboardPermission(req.user, "sales_transactions", "list")) {
      return res.status(403).json({ message: "Permission insuffisante" });
    }

    const result = await bookingService.listBookings({
      page: req.query.page,
      limit: req.query.limit,
      bookedBy: req.query.bookedBy,
      dateFrom: req.query.dateFrom || req.query.from,
      dateTo: req.query.dateTo || req.query.to,
      paymentMethod: req.query.paymentMethod,
      paymentStatus: req.query.paymentStatus,
      bookingSource: req.query.bookingSource,
      status: req.query.status,
    });

    return res.status(200).json(result);
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
  }
};

const formatIdentity = (value) => {
  if (!value || typeof value !== "object") {
    return "";
  }
  return `${value.firstName || ""} ${value.lastName || ""}`.trim() || value.email || "";
};

const formatSession = (session) => {
  if (!session) {
    return "";
  }
  const eventName = session.event?.name || "Séance";
  const date = formatDate(session.date);
  return `${eventName}${date ? ` - ${date}` : ""}${session.sessionTime ? ` ${session.sessionTime}` : ""}`;
};

const formatBookingCustomer = (booking) => {
  const customer = formatIdentity(booking.customer);
  if (customer) {
    return customer;
  }
  const guest = formatIdentity(booking.customerContact);
  return guest || "";
};

const exportBookings = async (req, res) => {
  try {
    if (!hasDashboardPermission(req.user, "sales_transactions", "list")) {
      return res.status(403).json({ message: "Permission insuffisante" });
    }

    const items = await bookingService.listBookingsForExport({
      bookedBy: req.query.bookedBy,
      dateFrom: req.query.dateFrom || req.query.from,
      dateTo: req.query.dateTo || req.query.to,
      paymentMethod: req.query.paymentMethod,
      paymentStatus: req.query.paymentStatus,
      bookingSource: req.query.bookingSource,
      status: req.query.status,
    });

    await sendTabularExport({
      res,
      format: req.params.format,
      baseFilename: "transactions",
      title: "Transactions",
      filters: [
        { label: "Date début", value: req.query.dateFrom || req.query.from },
        { label: "Date fin", value: req.query.dateTo || req.query.to },
        { label: "Paiement", value: req.query.paymentMethod },
        { label: "Statut paiement", value: req.query.paymentStatus },
        { label: "Source", value: req.query.bookingSource },
        { label: "Statut", value: req.query.status },
      ],
      columns: [
        { key: "bookingNumber", label: "Booking", value: (item) => item.bookingNumber || "" },
        { key: "session", label: "Séance", value: (item) => formatSession(item.session) },
        { key: "customer", label: "Client", value: formatBookingCustomer },
        { key: "source", label: "Source", value: (item) => item.bookingSource || "" },
        { key: "paymentMethod", label: "Paiement", value: (item) => item.paymentMethod || "" },
        { key: "paymentStatus", label: "Statut paiement", value: (item) => item.paymentStatus || "" },
        { key: "status", label: "Statut", value: (item) => item.status || "" },
        { key: "seatsCount", label: "Billets", value: (item) => item.seatsCount || 0 },
        { key: "totalAmount", label: "Total", value: (item) => formatCurrency(item.totalAmount) },
        { key: "createdAt", label: "Date", value: (item) => formatDateTime(item.createdAt) },
      ],
      rows: items,
    });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ message: error.message || "Server error" });
  }
};

const listMyBookings = async (req, res) => {
  try {
    const role = req.user && req.user.role;
    if (
      role !== "ticket_office" &&
      !(
        isDashboardStaffRole(role) &&
        hasDashboardPermission(req.user, "sales_transactions", "list")
      )
    ) {
      return res.status(403).json({ message: "Accès guichet requis" });
    }

    const result = await bookingService.listBookingsForUser({
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

const getBookingById = async (req, res) => {
  try {
    const role = req.user && req.user.role;
    if (
      role !== "ticket_office" &&
      !(
        isDashboardStaffRole(role) &&
        hasDashboardPermission(req.user, "sales_transactions", "list")
      )
    ) {
      return res.status(403).json({ message: "Accès guichet requis" });
    }

    const result = await bookingService.getBookingById({
      bookingId: req.params.bookingId,
      requesterId: req.user && req.user.sub,
      requesterRole: role,
    });

    return res.status(200).json(result);
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
  }
};

const cancelBookingTickets = async (req, res) => {
  try {
    const role = req.user && req.user.role;
    if (
      role !== "ticket_office" &&
      role !== "admin" &&
      role !== "super_admin"
    ) {
      return res.status(403).json({ message: "Accès guichet requis" });
    }

    const result = await bookingService.cancelBookingTickets({
      bookingId: req.params.bookingId,
      requesterId: req.user && req.user.sub,
      requesterRole: role,
      ticketIds: req.body?.ticketIds,
      io: req.io,
    });

    return res.status(200).json(result);
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
  }
};

const createBooking = async (req, res) => {
  try {
    const role = req.user && req.user.role;
    if (
      role !== "admin" &&
      role !== "super_admin" &&
      role !== "ticket_office" &&
      role !== "customer" &&
      role !== "guest"
    ) {
      return res.status(403).json({ message: "Accès refuse" });
    }

    const result = await bookingService.createBooking({
      payload: req.body || {},
      userId: req.user && req.user.sub,
      userRole: req.user && req.user.role,
      io: req.io,
    });

    return res.status(201).json(result);
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
  }
};

const trackPrint = async (req, res) => {
  try {
    const result = await bookingService.incrementPrintCount(req.params.bookingId);
    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const trackPrintCancelled = async (req, res) => {
  try {
    const result = await bookingService.logPrintCancelled(req.params.bookingId);
    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

module.exports = {
  cancelBookingTickets,
  listBookings,
  exportBookings,
  listMyBookings,
  getBookingById,
  createBooking,
  trackPrint,
  trackPrintCancelled,
};
