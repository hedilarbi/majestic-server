const mongoose = require("mongoose");
const User = require("../models/User");
const Booking = require("../models/Booking");
const Ticket = require("../models/Ticket");
const SubscriptionSale = require("../models/SubscriptionSale");

const resolvePagination = (page, limit) => {
  const parsedPage = Number.parseInt(page, 10);
  const parsedLimit = Number.parseInt(limit, 10);

  const safePage = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const safeLimit =
    Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.min(parsedLimit, 200)
      : 50;

  return {
    page: safePage,
    limit: safeLimit,
    skip: (safePage - 1) * safeLimit,
  };
};

const ALLOWED_ROLES = ["customer", "guest"];

const parseDateFilter = (value, label, boundary) => {
  if (!value) {
    return null;
  }

  const normalizedValue = String(value).trim();
  if (!normalizedValue) {
    return null;
  }

  const parsed = new Date(normalizedValue);
  if (Number.isNaN(parsed.getTime())) {
    const error = new Error(`${label} invalide`);
    error.status = 400;
    throw error;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalizedValue)) {
    if (boundary === "end") {
      parsed.setHours(23, 59, 59, 999);
    } else {
      parsed.setHours(0, 0, 0, 0);
    }
  }

  return parsed;
};

const buildUsersQuery = ({ search, role, status, dateFrom, dateTo } = {}) => {
  const query = {};

  if (role && ALLOWED_ROLES.includes(role)) {
    query.role = role;
  } else {
    query.role = { $in: ALLOWED_ROLES };
  }

  if (search) {
    query.$or = [
      { firstName: { $regex: search, $options: "i" } },
      { lastName: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
      { "guestContact.firstName": { $regex: search, $options: "i" } },
      { "guestContact.lastName": { $regex: search, $options: "i" } },
      { "guestContact.email": { $regex: search, $options: "i" } },
      { phone: { $regex: search, $options: "i" } },
    ];
  }

  if (status) {
    query.status = status;
  }

  const from = parseDateFilter(dateFrom, "dateFrom", "start");
  const to = parseDateFilter(dateTo, "dateTo", "end");
  if (from && to && from.getTime() > to.getTime()) {
    const error = new Error("dateFrom doit être antérieure à dateTo");
    error.status = 400;
    throw error;
  }
  if (from || to) {
    query.createdAt = {
      ...(from ? { $gte: from } : {}),
      ...(to ? { $lte: to } : {}),
    };
  }

  return query;
};

const normalizeAdminUser = (user) => {
  if (!user) {
    return user;
  }

  if (user.role !== "guest" || !user.guestContact) {
    return user;
  }

  return {
    ...user,
    technicalEmail: user.email,
    firstName: user.firstName || user.guestContact.firstName || "",
    lastName: user.lastName || user.guestContact.lastName || "",
    email: user.guestContact.email || user.email || "",
  };
};

const listUsers = async ({ page, limit, search, role, status, dateFrom, dateTo }) => {
  const { page: safePage, limit: safeLimit, skip } = resolvePagination(page, limit);

  const query = buildUsersQuery({ search, role, status, dateFrom, dateTo });

  const [total, items] = await Promise.all([
    User.countDocuments(query),
    User.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .select("-password")
      .lean(),
  ]);

  return {
    items: items.map(normalizeAdminUser),
    total,
    page: safePage,
    limit: safeLimit,
  };
};

const listUsersForExport = async ({ search, role, status, dateFrom, dateTo } = {}) => {
  const query = buildUsersQuery({ search, role, status, dateFrom, dateTo });
  const items = await User.find(query)
    .sort({ createdAt: -1 })
    .limit(5000)
    .select("-password")
    .lean();

  return items.map(normalizeAdminUser);
};

const getUserDetails = async (userId) => {
  if (!mongoose.isValidObjectId(userId)) {
    const error = new Error("Invalid user id");
    error.status = 400;
    throw error;
  }

  const user = await User.findById(userId).select("-password").lean();
  if (!user) {
    const error = new Error("User not found");
    error.status = 404;
    throw error;
  }

  // Fetch reservations
  const bookings = await Booking.find({ userId })
    .sort({ createdAt: -1 })
    .populate({
      path: "sessionId",
      select: "date sessionTime roomId eventId",
      populate: { path: "eventId", select: "name poster affiche image" },
    })
    .limit(10)
    .lean();

  // Fetch subscriptions
  const subscriptions = await SubscriptionSale.find({ userId })
    .sort({ createdAt: -1 })
    .populate("subscriptionId")
    .lean();

  return {
    user: normalizeAdminUser(user),
    bookings,
    subscriptions,
  };
};

const toggleUserStatus = async (userId) => {
  if (!mongoose.isValidObjectId(userId)) {
    const error = new Error("Invalid user id");
    error.status = 400;
    throw error;
  }

  const user = await User.findById(userId);
  if (!user) {
    const error = new Error("User not found");
    error.status = 404;
    throw error;
  }

  user.status = user.status === "suspended" ? "active" : "suspended";
  await user.save();

  return {
    id: user._id,
    status: user.status,
  };
};

module.exports = {
  listUsers,
  listUsersForExport,
  getUserDetails,
  toggleUserStatus,
};
