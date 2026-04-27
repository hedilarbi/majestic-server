const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const User = require("../models/User");
const {
  STAFF_LOGIN_ROLES,
  normalizePermissionList,
} = require("../config/dashboardPermissions");

const SALT_ROUNDS = 12;
const STAFF_ROLES = [
  "admin",
  "super_admin",
  "blog_manager",
  "cashier",
  "ticket_office",
  "door_staff",
];
const ROLE_ALIASES = {
  caissier: "cashier",
  cashier: "cashier",
  guichet: "ticket_office",
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

const assertActorCanManageRole = ({ actor, targetRole, operation }) => {
  if (!actor || !STAFF_ROLES.includes(actor.role)) {
    const error = new Error("Accès staff requis");
    error.status = 403;
    throw error;
  }

  if (actor.role === "super_admin") {
    return;
  }

  const safeTargetRole = normalizeRole(targetRole);

  if (safeTargetRole === "admin" || safeTargetRole === "super_admin") {
    const error = new Error(
      `Seul le super administrateur peut ${operation} un compte administrateur`,
    );
    error.status = 403;
    throw error;
  }
};

const buildRoleDetails = ({
  role,
  permissions,
  isActive,
  baseRoleDetails = {},
}) => {
  const normalizedRole = normalizeRole(role);
  const nextRoleDetails = { ...(baseRoleDetails || {}) };

  if (normalizedRole === "admin") {
    nextRoleDetails.permissions = normalizePermissionList(permissions);
    nextRoleDetails.permissionsConfigured = true;
    delete nextRoleDetails.isActive;
    return nextRoleDetails;
  }

  delete nextRoleDetails.permissions;
  delete nextRoleDetails.permissionsConfigured;

  if (normalizedRole === "ticket_office" && typeof isActive === "boolean") {
    nextRoleDetails.isActive = isActive;
  } else if (normalizedRole !== "ticket_office") {
    delete nextRoleDetails.isActive;
  }

  return nextRoleDetails;
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
  requester,
}) => {
  if (!email || !password || !role) {
    const error = new Error("Email, password, and role are required");
    error.status = 400;
    throw error;
  }

  const normalizedRole = normalizeRole(role);
  if (!STAFF_ROLES.includes(normalizedRole)) {
    const error = new Error(
      "Role must be one of: admin, super_admin, blog_manager, cashier, ticket_office, door_staff",
    );
    error.status = 400;
    throw error;
  }

  assertActorCanManageRole({
    actor: requester,
    targetRole: normalizedRole,
    operation: "créer",
  });

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    const error = new Error("User already exists");
    error.status = 409;
    throw error;
  }

  const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
  const roleDetails = buildRoleDetails({
    role: normalizedRole,
    permissions,
    isActive,
  });

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

const createBootstrapSuperAdmin = async ({
  email,
  password,
  firstName,
  lastName,
  phone,
}) => {
  if (!email || !password) {
    const error = new Error("Email and password are required");
    error.status = 400;
    throw error;
  }

  const existingSuperAdmin = await User.findOne({ role: "super_admin" });
  if (existingSuperAdmin) {
    const error = new Error("Un super administrateur existe déjà");
    error.status = 409;
    throw error;
  }

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    const error = new Error("User already exists");
    error.status = 409;
    throw error;
  }

  const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
  const user = await User.create({
    email,
    password: hashedPassword,
    firstName,
    lastName,
    phone,
    role: "super_admin",
    roleDetails: {},
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

  const user = await User.findOne({ email, role: { $in: STAFF_LOGIN_ROLES } });
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

const updateStaff = async (id, updates, requester) => {
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
  const existingRoleDetails = user.roleDetails ? user.roleDetails.toObject() : {};
  const requestedRole = Object.prototype.hasOwnProperty.call(updates || {}, "role")
    ? normalizeRole(updates.role)
    : user.role;

  assertActorCanManageRole({
    actor: requester,
    targetRole: user.role,
    operation: "modifier",
  });
  assertActorCanManageRole({
    actor: requester,
    targetRole: requestedRole,
    operation: "attribuer",
  });

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
    if (!STAFF_ROLES.includes(requestedRole)) {
      const error = new Error(
        "Role must be one of: admin, super_admin, blog_manager, cashier, ticket_office, door_staff"
      );
      error.status = 400;
      throw error;
    }
    updateData.role = requestedRole;
  }

  if (requestedRole === "admin" && requester?.role !== "super_admin") {
    const error = new Error(
      "Seul le super administrateur peut gerer les permissions admin",
    );
    error.status = 403;
    throw error;
  }

  const nextRoleDetails = buildRoleDetails({
    role: requestedRole,
    permissions:
      requestedRole === "admin"
        ? updates?.permissions
        : existingRoleDetails.permissions,
    isActive:
      Object.prototype.hasOwnProperty.call(updates || {}, "isActive")
        ? updates.isActive
        : existingRoleDetails.isActive,
    baseRoleDetails: existingRoleDetails,
  });

  if (Object.keys(nextRoleDetails).length > 0) {
    updateData.roleDetails = nextRoleDetails;
  } else if (
    existingRoleDetails &&
    Object.keys(existingRoleDetails).length > 0 &&
    requestedRole !== "admin"
  ) {
    updateData.roleDetails = nextRoleDetails;
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

const deleteStaff = async (id, requester) => {
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

  assertActorCanManageRole({
    actor: requester,
    targetRole: user.role,
    operation: "supprimer",
  });

  await User.deleteOne({ _id: id });
  return sanitizeUser(user);
};

const toggleStaffStatus = async (id, requester) => {
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

  assertActorCanManageRole({
    actor: requester,
    targetRole: user.role,
    operation: "modifier",
  });

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

const bootstrapPromoteAdminsToSuperAdmin = async () => {
  const admins = await User.find({ role: "admin" });

  if (admins.length === 0) {
    const error = new Error("Aucun staff avec role admin");
    error.status = 404;
    throw error;
  }

  const adminIds = admins.map((user) => user._id);
  await User.updateMany(
    { _id: { $in: adminIds } },
    {
      $set: {
        role: "super_admin",
        roleDetails: {},
      },
    },
  );

  const promotedUsers = await User.find({ _id: { $in: adminIds } }).sort({
    createdAt: 1,
  });

  return {
    promotedCount: promotedUsers.length,
    users: promotedUsers.map((user) => sanitizeUser(user)),
  };
};

module.exports = {
  createStaff,
  createBootstrapSuperAdmin,
  loginStaff,
  getStaffById,
  updateStaff,
  deleteStaff,
  toggleStaffStatus,
  listStaff,
  bootstrapPromoteAdminsToSuperAdmin,
};
