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
    { expiresIn },
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
      "Role must be one of: admin, ticket_office, door_staff",
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
    emailVerified: true,
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

const updateStaff = async (id, updates) => {
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

  const updateData = {};
  const roleDetails = user.roleDetails ? user.roleDetails.toObject() : {};

  if (updates && Object.prototype.hasOwnProperty.call(updates, "email")) {
    if (!updates.email) {
      const error = new Error("Email is required");
      error.status = 400;
      throw error;
    }
    updateData.email = updates.email;
  }

  if (updates && Object.prototype.hasOwnProperty.call(updates, "firstName")) {
    updateData.firstName = updates.firstName;
  }

  if (updates && Object.prototype.hasOwnProperty.call(updates, "lastName")) {
    updateData.lastName = updates.lastName;
  }

  if (updates && Object.prototype.hasOwnProperty.call(updates, "phone")) {
    updateData.phone = updates.phone;
  }

  if (updates && Object.prototype.hasOwnProperty.call(updates, "password")) {
    if (!updates.password) {
      const error = new Error("Password is required");
      error.status = 400;
      throw error;
    }
    updateData.password = await bcrypt.hash(updates.password, SALT_ROUNDS);
  }

  if (updates && Object.prototype.hasOwnProperty.call(updates, "role")) {
    const normalizedRole = normalizeRole(updates.role);
    if (!STAFF_ROLES.includes(normalizedRole)) {
      const error = new Error(
        "Role must be one of: admin, ticket_office, door_staff"
      );
      error.status = 400;
      throw error;
    }
    updateData.role = normalizedRole;
  }

  if (updates && Object.prototype.hasOwnProperty.call(updates, "permissions")) {
    if (Array.isArray(updates.permissions)) {
      roleDetails.permissions = updates.permissions;
    }
  }

  if (updates && Object.prototype.hasOwnProperty.call(updates, "isActive")) {
    if (typeof updates.isActive === "boolean") {
      roleDetails.isActive = updates.isActive;
    }
  }

  if (Object.keys(roleDetails).length > 0) {
    updateData.roleDetails = roleDetails;
  }

  if (Object.keys(updateData).length === 0) {
    const error = new Error("No valid fields provided for update");
    error.status = 400;
    throw error;
  }

  if (updateData.email) {
    const emailOwner = await User.findOne({
      email: updateData.email,
      _id: { $ne: id },
    });
    if (emailOwner) {
      const error = new Error("User already exists");
      error.status = 409;
      throw error;
    }
  }

  const updated = await User.findByIdAndUpdate(id, updateData, {
    new: true,
    runValidators: true,
  });

  if (!updated) {
    const error = new Error("User not found");
    error.status = 404;
    throw error;
  }

  return sanitizeUser(updated);
};

const deleteStaff = async (id) => {
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

  await User.deleteOne({ _id: id });
  return sanitizeUser(user);
};

const toggleStaffStatus = async (id) => {
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

  const nextStatus = user.status === "suspended" ? "active" : "suspended";
  user.status = nextStatus;
  await user.save();

  return sanitizeUser(user);
};

const listStaff = async () => {
  const staff = await User.find({ role: { $in: STAFF_ROLES } }).sort({
    createdAt: -1,
  });
  return staff.map((user) => sanitizeUser(user));
};

module.exports = {
  createStaff,
  loginStaff,
  getStaffById,
  updateStaff,
  deleteStaff,
  toggleStaffStatus,
  listStaff,
};
