const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const User = require("../models/User");

const GUEST_ROLE = "guest";
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalizeText = (value) =>
  typeof value === "string" ? value.trim() : "";

const normalizeEmail = (value) => {
  const email = normalizeText(value).toLowerCase();
  return EMAIL_REGEX.test(email) ? email : "";
};

const normalizeGuestContact = (value = {}) => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const firstName = normalizeText(value.firstName || value.prenom);
  const lastName = normalizeText(value.lastName || value.nom);
  const email = normalizeEmail(value.email);

  if (!firstName && !lastName && !email) {
    return null;
  }

  return {
    firstName,
    lastName,
    email,
  };
};

const buildGuestEmail = () =>
  `guest.${new mongoose.Types.ObjectId().toString()}@guest.local`;

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

  if (data.role === GUEST_ROLE && data.guestContact) {
    data.firstName = data.firstName || data.guestContact.firstName || "";
    data.lastName = data.lastName || data.guestContact.lastName || "";
    data.email = data.guestContact.email || data.email || "";
  }

  return data;
};

const createGuest = async (contactPayload = {}) => {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const contact = normalizeGuestContact(contactPayload);
  const user = await User.create({
    email: buildGuestEmail(),
    firstName: contact?.firstName || "",
    lastName: contact?.lastName || "",
    guestContact: contact || undefined,
    role: GUEST_ROLE,
    status: "active",
    lastSeenAt: now,
    expiredAt: expiresAt,
  });

  const token = buildToken(user);

  return { token, user: sanitizeUser(user) };
};

const updateGuestContact = async ({ guestId, contact, dbSession } = {}) => {
  if (!guestId || !mongoose.isValidObjectId(guestId)) {
    return null;
  }

  const normalizedContact = normalizeGuestContact(contact);
  if (!normalizedContact) {
    return null;
  }

  const update = {
    lastSeenAt: new Date(),
    "guestContact.firstName": normalizedContact.firstName,
    "guestContact.lastName": normalizedContact.lastName,
    "guestContact.email": normalizedContact.email,
  };

  if (normalizedContact.firstName) {
    update.firstName = normalizedContact.firstName;
  }

  if (normalizedContact.lastName) {
    update.lastName = normalizedContact.lastName;
  }

  const query = User.findOneAndUpdate(
    { _id: guestId, role: GUEST_ROLE },
    { $set: update },
    { new: true, runValidators: true },
  );

  if (dbSession) {
    query.session(dbSession);
  }

  const user = await query;
  return sanitizeUser(user);
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
  updateGuestContact,
};
