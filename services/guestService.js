const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const User = require("../models/User");

const GUEST_ROLE = "guest";

const buildToken = (user) => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    const error = new Error("JWT_SECRET is not set");
    error.status = 500;
    throw error;
  }

  const expiresIn = process.env.JWT_EXPIRES_IN || "1d";

  return jwt.sign(
    {
      sub: user._id.toString(),
      role: user.role,
      email: user.email,
    },
    secret,
    { expiresIn }
  );
};

const sanitizeUser = (user) => {
  if (!user) {
    return null;
  }

  const data = user.toObject({ versionKey: false });
  delete data.password;
  return data;
};

const createGuest = async () => {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const uniqueGuestEmail = `guest.${new mongoose.Types.ObjectId().toString()}@guest.local`;
  const user = await User.create({
    email: uniqueGuestEmail,
    role: GUEST_ROLE,
    status: "active",
    lastSeenAt: now,
    expiredAt: expiresAt,
  });

  const token = buildToken(user);

  return { token, user: sanitizeUser(user) };
};

const getGuestById = async (id) => {
  if (!id) {
    const error = new Error("Missing user id");
    error.status = 401;
    throw error;
  }

  if (!mongoose.isValidObjectId(id)) {
    const error = new Error("Invalid user id");
    error.status = 400;
    throw error;
  }

  const user = await User.findById(id);
  if (!user) {
    const error = new Error("User not found");
    error.status = 404;
    throw error;
  }

  if (user.role !== GUEST_ROLE) {
    const error = new Error("Guest access required");
    error.status = 403;
    throw error;
  }

  return sanitizeUser(user);
};

module.exports = {
  createGuest,
  getGuestById,
};
