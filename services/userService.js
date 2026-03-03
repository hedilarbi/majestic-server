const mongoose = require("mongoose");

const User = require("../models/User");

const ALLOWED_ROLES = ["guest", "customer"];

const getUserTokenData = async (payload) => {
  if (!payload || !payload.sub) {
    const error = new Error("Missing token data");
    error.status = 401;
    throw error;
  }

  if (!mongoose.isValidObjectId(payload.sub)) {
    const error = new Error("Invalid user id");
    error.status = 400;
    throw error;
  }

  const user = await User.findById(payload.sub);

  if (!user) {
    const error = new Error("User not found");
    error.status = 404;
    throw error;
  }

  if (!ALLOWED_ROLES.includes(user.role)) {
    const error = new Error("Access denied");
    error.status = 403;
    throw error;
  }

  const now = new Date();
  const updateData = { lastSeenAt: now };
  if (user.role === "guest") {
    updateData.expiredAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  }

  await User.updateOne({ _id: user._id }, { $set: updateData });

  return user;
};

module.exports = {
  getUserTokenData,
};
