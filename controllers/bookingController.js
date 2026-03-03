const bookingService = require("../services/bookingService");

const listBookings = async (req, res) => {
  try {
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({ message: "Acces admin requis" });
    }

    const result = await bookingService.listBookings({
      page: req.query.page,
      limit: req.query.limit,
      bookedBy: req.query.bookedBy,
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
    if (role !== "admin" && role !== "ticket_office") {
      return res.status(403).json({ message: "Acces guichet requis" });
    }

    const result = await bookingService.listBookingsForUser({
      userId: req.user && req.user.sub,
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

const getBookingById = async (req, res) => {
  try {
    const role = req.user && req.user.role;
    if (role !== "admin" && role !== "ticket_office") {
      return res.status(403).json({ message: "Acces guichet requis" });
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

const createBooking = async (req, res) => {
  try {
    const role = req.user && req.user.role;
    if (
      role !== "admin" &&
      role !== "ticket_office" &&
      role !== "customer" &&
      role !== "guest"
    ) {
      return res.status(403).json({ message: "Acces refuse" });
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

module.exports = {
  listBookings,
  listMyBookings,
  getBookingById,
  createBooking,
};
