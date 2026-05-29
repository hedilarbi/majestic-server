const bookingService = require("../services/bookingService");
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
    });

    return res.status(200).json(result);
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
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
  listMyBookings,
  getBookingById,
  createBooking,
  trackPrint,
  trackPrintCancelled,
};
