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

const listUsers = async ({ page, limit, search, role, status }) => {
  const { page: safePage, limit: safeLimit, skip } = resolvePagination(page, limit);

  const query = {};
  
  if (search) {
    query.$or = [
      { firstName: { $regex: search, $options: "i" } },
      { lastName: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
      { phone: { $regex: search, $options: "i" } },
    ];
  }

  if (role) {
    query.role = role;
  }

  if (status) {
    query.status = status;
  }

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
    items,
    total,
    page: safePage,
    limit: safeLimit,
  };
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
    user,
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
  getUserDetails,
  toggleUserStatus,
};
