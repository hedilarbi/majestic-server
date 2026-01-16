const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const User = require("../models/User");

const SALT_ROUNDS = 12;

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

const createAdmin = async ({
  email,
  password,
  firstName,
  lastName,
  phone,
  permissions,
}) => {
  if (!email || !password) {
    const error = new Error("Email and password are required");
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

  const user = await User.create({
    email,
    password: hashedPassword,
    firstName,
    lastName,
    phone,
    role: "admin",
    roleDetails: {
      permissions: Array.isArray(permissions) ? permissions : [],
    },
    status: "active",
  });

  return sanitizeUser(user);
};

const loginAdmin = async ({ email, password }) => {
  if (!email || !password) {
    const error = new Error("Email and password are required");
    error.status = 400;
    throw error;
  }

  const user = await User.findOne({ email, role: "admin" });
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

module.exports = {
  createAdmin,
  loginAdmin,
};
