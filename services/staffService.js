const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const User = require("../models/User");

const SALT_ROUNDS = 12;
const STAFF_ROLES = ["admin", "ticket_office", "door_staff"];
const ROLE_ALIASES = {
  caissier: "ticket_office",
};

const normalizeRole = (role) => {
  if (!role || typeof role !== "string") {
    return role;
  }

  const normalized = role.trim().toLowerCase();
  return ROLE_ALIASES[normalized] || normalized;
};

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

const createStaff = async ({
  email,
  password,
  firstName,
  lastName,
  phone,
  role,
  permissions,
  isActive,
}) => {
  if (!email || !password || !role) {
    const error = new Error("Email, password, and role are required");
    error.status = 400;
    throw error;
  }

  const normalizedRole = normalizeRole(role);
  if (!STAFF_ROLES.includes(normalizedRole)) {
    const error = new Error(
      "Role must be one of: admin, ticket_office, door_staff"
    );
    error.status = 400;
    throw error;
  }

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    const error = new Error("User already exists");
    error.status = 409;
    throw error;
  }

  const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

  const roleDetails = {};
  if (Array.isArray(permissions)) {
    roleDetails.permissions = permissions;
  }

  if (normalizedRole === "ticket_office" && typeof isActive === "boolean") {
    roleDetails.isActive = isActive;
  }

  const user = await User.create({
    email,
    password: hashedPassword,
    firstName,
    lastName,
    phone,
    role: normalizedRole,
    roleDetails,
    status: "active",
  });

  return sanitizeUser(user);
};

const loginStaff = async ({ email, password }) => {
  if (!email || !password) {
    const error = new Error("Email and password are required");
    error.status = 400;
    throw error;
  }

  const user = await User.findOne({ email, role: { $in: STAFF_ROLES } });
  if (!user) {
    const error = new Error("Invalid email or password");
    error.status = 401;
    throw error;
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    const error = new Error("Invalid email or password");
    error.status = 401;
    throw error;
  }

  const token = buildToken(user);

  return { token, user: sanitizeUser(user) };
};

const getStaffById = async (id) => {
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

  if (!STAFF_ROLES.includes(user.role)) {
    const error = new Error("Staff access required");
    error.status = 403;
    throw error;
  }

  return sanitizeUser(user);
};

module.exports = {
  createStaff,
  loginStaff,
  getStaffById,
};
