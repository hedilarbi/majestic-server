const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const User = require("../models/User");
const EmailVerification = require("../models/EmailVerification");
const SeatReservation = require("../models/SeatReservation");
const SeatLock = require("../models/SeatLock");

const SALT_ROUNDS = 12;
const CUSTOMER_ROLE = "customer";
const GUEST_ROLE = "guest";
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_LENGTH = 6;
const OTP_EXPIRATION_MINUTES = 10;
const MAX_OTP_ATTEMPTS = 5;
const OTP_PURPOSE_EMAIL_VERIFICATION = "email_verification";
const OTP_PURPOSE_PASSWORD_RESET = "password_reset";

const normalizeEmail = (email, { required = false } = {}) => {
  if (email === undefined || email === null) {
    if (required) {
      const error = new Error("Le champ email est requis");
      error.status = 400;
      throw error;
    }
    return null;
  }

  if (typeof email !== "string") {
    const error = new Error("Format d'email invalide");
    error.status = 400;
    throw error;
  }

  const trimmed = email.trim();
  if (!trimmed) {
    const error = new Error("Le champ email est requis");
    error.status = 400;
    throw error;
  }

  if (!EMAIL_REGEX.test(trimmed)) {
    const error = new Error("Format d'email invalide");
    error.status = 400;
    throw error;
  }

  return trimmed;
};

const requirePassword = (password) => {
  if (password === undefined || password === null) {
    const error = new Error("Le champ mot de passe est requis");
    error.status = 400;
    throw error;
  }

  if (typeof password !== "string" || password.length === 0) {
    const error = new Error("Le champ mot de passe est requis");
    error.status = 400;
    throw error;
  }

  return password;
};

const normalizeOtp = (otp) => {
  if (otp === undefined || otp === null) {
    const error = new Error("Le code OTP est requis");
    error.status = 400;
    throw error;
  }

  const value = String(otp).trim();
  if (!value) {
    const error = new Error("Le code OTP est requis");
    error.status = 400;
    throw error;
  }

  const otpRegex = new RegExp(`^\\d{${OTP_LENGTH}}$`);
  if (!otpRegex.test(value)) {
    const error = new Error("Code OTP invalide");
    error.status = 400;
    throw error;
  }

  return value;
};

const generateOtp = () => {
  const max = Math.pow(10, OTP_LENGTH);
  const otp = Math.floor(Math.random() * max);
  return String(otp).padStart(OTP_LENGTH, "0");
};

const createEmailVerification = async (
  email,
  { resendCount = 0, purpose = OTP_PURPOSE_EMAIL_VERIFICATION } = {},
) => {
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + OTP_EXPIRATION_MINUTES * 60 * 1000,
  );
  //const otp = generateOtp();
  const otp = "123456"; // Pour les tests uniquement, a remplacer par la ligne au-dessus en production
  return EmailVerification.create({
    email,
    purpose,
    otp,
    expiresAt,
    attempts: 0,
    resendCount,
    lastSentAt: now,
  });
};

const assertOtpVerification = async ({ email, otp, purpose }) => {
  const verification = await EmailVerification.findOne({
    email,
    purpose,
  }).sort({ createdAt: -1 });

  if (!verification) {
    const error = new Error("Code OTP invalide ou expire");
    error.status = 400;
    throw error;
  }

  const now = new Date();
  if (verification.expiresAt && verification.expiresAt <= now) {
    await EmailVerification.deleteMany({ email, purpose });
    const error = new Error("Code OTP expire");
    error.status = 400;
    throw error;
  }

  if (verification.attempts >= MAX_OTP_ATTEMPTS) {
    const error = new Error("Nombre maximum de tentatives atteint");
    error.status = 429;
    throw error;
  }

  if (verification.otp !== otp) {
    const nextAttempts = verification.attempts + 1;
    await EmailVerification.updateOne(
      { _id: verification._id },
      { $set: { attempts: nextAttempts } },
    );

    if (nextAttempts >= MAX_OTP_ATTEMPTS) {
      const error = new Error("Nombre maximum de tentatives atteint");
      error.status = 429;
      throw error;
    }

    const error = new Error("Code OTP invalide");
    error.status = 400;
    throw error;
  }

  return verification;
};

const buildToken = (user) => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    const error = new Error("JWT_SECRET n'est pas defini");
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

const createCustomer = async ({ guestId, tokenRole, payload }) => {
  if (!guestId) {
    const error = new Error("Identifiant utilisateur manquant");
    error.status = 401;
    throw error;
  }

  if (tokenRole && tokenRole !== GUEST_ROLE) {
    const error = new Error("Acces guest requis");
    error.status = 403;
    throw error;
  }

  if (!mongoose.isValidObjectId(guestId)) {
    const error = new Error("Identifiant utilisateur invalide");
    error.status = 400;
    throw error;
  }

  const guestUser = await User.findById(guestId);
  if (!guestUser) {
    const error = new Error("Utilisateur introuvable");
    error.status = 404;
    throw error;
  }

  if (guestUser.role !== GUEST_ROLE) {
    const error = new Error("Acces guest requis");
    error.status = 403;
    throw error;
  }

  const normalizedEmail = normalizeEmail(payload && payload.email, {
    required: true,
  });
  const normalizedPassword = requirePassword(payload && payload.password);

  const existingUser = await User.findOne({
    email: normalizedEmail,
    _id: { $ne: guestId },
  });
  if (existingUser) {
    const error = new Error("Compte avec cet email deja existant");
    error.status = 409;
    throw error;
  }

  const hashedPassword = await bcrypt.hash(normalizedPassword, SALT_ROUNDS);

  const now = new Date();
  const updateData = {
    email: normalizedEmail,
    password: hashedPassword,
    role: CUSTOMER_ROLE,
    status: "active",
    emailVerified: false,
    lastSeenAt: now,
  };

  if (payload && Object.prototype.hasOwnProperty.call(payload, "firstName")) {
    updateData.firstName = payload.firstName;
  }

  if (payload && Object.prototype.hasOwnProperty.call(payload, "lastName")) {
    updateData.lastName = payload.lastName;
  }

  if (payload && Object.prototype.hasOwnProperty.call(payload, "phone")) {
    updateData.phone = payload.phone;
  }

  const user = await User.findByIdAndUpdate(
    guestId,
    {
      $set: updateData,
      $unset: { expiredAt: 1 },
    },
    { new: true, runValidators: true },
  );

  if (!user) {
    const error = new Error("Utilisateur introuvable");
    error.status = 404;
    throw error;
  }

  await EmailVerification.deleteMany({
    email: normalizedEmail,
    purpose: OTP_PURPOSE_EMAIL_VERIFICATION,
  });
  await createEmailVerification(normalizedEmail, {
    purpose: OTP_PURPOSE_EMAIL_VERIFICATION,
  });

  const token = buildToken(user);

  return { token, user: sanitizeUser(user) };
};

const migrateGuestReservationsToCustomer = async ({ guestId, customerId }) => {
  if (!guestId || !customerId) {
    return;
  }

  if (
    !mongoose.isValidObjectId(guestId) ||
    !mongoose.isValidObjectId(customerId)
  ) {
    return;
  }

  if (String(guestId) === String(customerId)) {
    return;
  }

  const now = new Date();

  await Promise.all([
    SeatReservation.updateMany(
      {
        userId: guestId,
        status: "pending",
        expiresAt: { $gt: now },
      },
      { $set: { userId: customerId } },
    ),
    SeatLock.updateMany(
      {
        reservedBy: guestId,
        expiresAt: { $gt: now },
      },
      { $set: { reservedBy: customerId } },
    ),
  ]);
};

const loginCustomer = async ({ email, password, guestId, tokenRole }) => {
  const normalizedEmail = normalizeEmail(email, { required: true });
  const normalizedPassword = requirePassword(password);

  const user = await User.findOne({
    email: normalizedEmail,
    role: CUSTOMER_ROLE,
  });
  if (!user) {
    const error = new Error("Email ou mot de passe invalide");
    error.status = 401;
    throw error;
  }

  const isMatch = await bcrypt.compare(normalizedPassword, user.password);
  if (!isMatch) {
    const error = new Error("Email ou mot de passe invalide");
    error.status = 401;
    throw error;
  }

  user.lastSeenAt = new Date();
  await user.save();

  if (tokenRole === GUEST_ROLE && guestId) {
    await migrateGuestReservationsToCustomer({
      guestId,
      customerId: user._id,
    });
  }

  const token = buildToken(user);

  return { token, user: sanitizeUser(user) };
};

const getCustomerById = async (id) => {
  if (!id) {
    const error = new Error("Identifiant utilisateur manquant");
    error.status = 401;
    throw error;
  }

  if (!mongoose.isValidObjectId(id)) {
    const error = new Error("Identifiant utilisateur invalide");
    error.status = 400;
    throw error;
  }

  const user = await User.findById(id);
  if (!user) {
    const error = new Error("Utilisateur introuvable");
    error.status = 404;
    throw error;
  }

  if (user.role !== CUSTOMER_ROLE) {
    const error = new Error("Acces client requis");
    error.status = 403;
    throw error;
  }

  return sanitizeUser(user);
};

const updateCustomerProfile = async (id, updates) => {
  if (!id) {
    const error = new Error("Identifiant utilisateur manquant");
    error.status = 401;
    throw error;
  }

  if (!mongoose.isValidObjectId(id)) {
    const error = new Error("Identifiant utilisateur invalide");
    error.status = 400;
    throw error;
  }

  const existingUser = await User.findById(id);
  if (!existingUser) {
    const error = new Error("Utilisateur introuvable");
    error.status = 404;
    throw error;
  }

  if (existingUser.role !== CUSTOMER_ROLE) {
    const error = new Error("Acces client requis");
    error.status = 403;
    throw error;
  }

  const updateData = {};
  if (updates && Object.prototype.hasOwnProperty.call(updates, "email")) {
    const normalizedEmail = normalizeEmail(updates.email, { required: true });
    updateData.email = normalizedEmail;
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
    const normalizedPassword = requirePassword(updates.password);
    updateData.password = await bcrypt.hash(normalizedPassword, SALT_ROUNDS);
  }

  if (Object.keys(updateData).length === 0) {
    const error = new Error("Aucun champ valide fourni pour la mise a jour");
    error.status = 400;
    throw error;
  }

  if (updateData.email) {
    const emailOwner = await User.findOne({
      email: updateData.email,
      _id: { $ne: id },
    });
    if (emailOwner) {
      const error = new Error("Compte avec cet email deja existant");
      error.status = 409;
      throw error;
    }
  }

  const user = await User.findByIdAndUpdate(id, updateData, {
    new: true,
    runValidators: true,
  });

  if (!user) {
    const error = new Error("Utilisateur introuvable");
    error.status = 404;
    throw error;
  }

  return sanitizeUser(user);
};

const resetCustomerPassword = async ({
  customerId,
  oldPassword,
  newPassword,
}) => {
  if (!customerId) {
    const error = new Error("Identifiant utilisateur manquant");
    error.status = 401;
    throw error;
  }

  if (!mongoose.isValidObjectId(customerId)) {
    const error = new Error("Identifiant utilisateur invalide");
    error.status = 400;
    throw error;
  }

  const normalizedOldPassword = requirePassword(oldPassword);
  const normalizedNewPassword = requirePassword(newPassword);

  if (normalizedOldPassword === normalizedNewPassword) {
    const error = new Error("Le nouveau mot de passe doit etre different");
    error.status = 400;
    throw error;
  }

  const user = await User.findById(customerId);
  if (!user) {
    const error = new Error("Utilisateur introuvable");
    error.status = 404;
    throw error;
  }

  if (user.role !== CUSTOMER_ROLE) {
    const error = new Error("Acces client requis");
    error.status = 403;
    throw error;
  }

  const isMatch = await bcrypt.compare(
    normalizedOldPassword,
    user.password || "",
  );
  if (!isMatch) {
    const error = new Error("Ancien mot de passe invalide");
    error.status = 401;
    throw error;
  }

  user.password = await bcrypt.hash(normalizedNewPassword, SALT_ROUNDS);
  await user.save();

  return { message: "Mot de passe mis a jour" };
};

const requestCustomerPasswordReset = async ({ email }) => {
  const normalizedEmail = normalizeEmail(email, { required: true });

  const user = await User.findOne({
    email: normalizedEmail,
    role: CUSTOMER_ROLE,
  });
  if (!user) {
    const error = new Error("Utilisateur introuvable");
    error.status = 404;
    throw error;
  }

  const previous = await EmailVerification.findOne({
    email: normalizedEmail,
    purpose: OTP_PURPOSE_PASSWORD_RESET,
  }).sort({ createdAt: -1 });

  const resendCount = previous ? (previous.resendCount || 0) + 1 : 0;

  await EmailVerification.deleteMany({
    email: normalizedEmail,
    purpose: OTP_PURPOSE_PASSWORD_RESET,
  });
  await createEmailVerification(normalizedEmail, {
    resendCount,
    purpose: OTP_PURPOSE_PASSWORD_RESET,
  });

  return { message: "Code de reinitialisation envoye" };
};

const resendCustomerPasswordResetOtp = async ({ email }) => {
  const normalizedEmail = normalizeEmail(email, { required: true });

  const user = await User.findOne({
    email: normalizedEmail,
    role: CUSTOMER_ROLE,
  });
  if (!user) {
    const error = new Error("Utilisateur introuvable");
    error.status = 404;
    throw error;
  }

  const previous = await EmailVerification.findOne({
    email: normalizedEmail,
    purpose: OTP_PURPOSE_PASSWORD_RESET,
  }).sort({ createdAt: -1 });

  const resendCount = previous ? (previous.resendCount || 0) + 1 : 0;

  await EmailVerification.deleteMany({
    email: normalizedEmail,
    purpose: OTP_PURPOSE_PASSWORD_RESET,
  });
  await createEmailVerification(normalizedEmail, {
    resendCount,
    purpose: OTP_PURPOSE_PASSWORD_RESET,
  });

  return { message: "Code de reinitialisation renvoye" };
};

const confirmCustomerPasswordReset = async ({ email, otp, newPassword }) => {
  const normalizedEmail = normalizeEmail(email, { required: true });
  const normalizedOtp = normalizeOtp(otp);
  const normalizedPassword = requirePassword(newPassword);

  await assertOtpVerification({
    email: normalizedEmail,
    otp: normalizedOtp,
    purpose: OTP_PURPOSE_PASSWORD_RESET,
  });

  const user = await User.findOne({
    email: normalizedEmail,
    role: CUSTOMER_ROLE,
  });
  if (!user) {
    const error = new Error("Utilisateur introuvable");
    error.status = 404;
    throw error;
  }

  user.password = await bcrypt.hash(normalizedPassword, SALT_ROUNDS);
  await user.save();

  await EmailVerification.deleteMany({
    email: normalizedEmail,
    purpose: OTP_PURPOSE_PASSWORD_RESET,
  });

  return { message: "Mot de passe reinitialise" };
};

const verifyCustomerOtp = async ({ email, otp }) => {
  const normalizedEmail = normalizeEmail(email, { required: true });
  const normalizedOtp = normalizeOtp(otp);

  await assertOtpVerification({
    email: normalizedEmail,
    otp: normalizedOtp,
    purpose: OTP_PURPOSE_EMAIL_VERIFICATION,
  });

  const user = await User.findOne({
    email: normalizedEmail,
    role: CUSTOMER_ROLE,
  });
  if (!user) {
    const error = new Error("Utilisateur introuvable");
    error.status = 404;
    throw error;
  }

  if (!user.emailVerified) {
    user.emailVerified = true;
    await user.save();
  }

  await EmailVerification.deleteMany({
    email: normalizedEmail,
    purpose: OTP_PURPOSE_EMAIL_VERIFICATION,
  });

  return { user: sanitizeUser(user) };
};

const resendCustomerOtp = async ({ email }) => {
  const normalizedEmail = normalizeEmail(email, { required: true });
  const user = await User.findOne({
    email: normalizedEmail,
    role: CUSTOMER_ROLE,
  });
  if (!user) {
    const error = new Error("Utilisateur introuvable");
    error.status = 404;
    throw error;
  }

  if (user.emailVerified) {
    const error = new Error("Email deja verifie");
    error.status = 400;
    throw error;
  }

  const previous = await EmailVerification.findOne({
    email: normalizedEmail,
    purpose: OTP_PURPOSE_EMAIL_VERIFICATION,
  }).sort({ createdAt: -1 });

  const resendCount = previous ? (previous.resendCount || 0) + 1 : 0;

  await EmailVerification.deleteMany({
    email: normalizedEmail,
    purpose: OTP_PURPOSE_EMAIL_VERIFICATION,
  });
  await createEmailVerification(normalizedEmail, {
    resendCount,
    purpose: OTP_PURPOSE_EMAIL_VERIFICATION,
  });

  return { message: "Code OTP renvoye" };
};

module.exports = {
  createCustomer,
  loginCustomer,
  getCustomerById,
  updateCustomerProfile,
  resetCustomerPassword,
  requestCustomerPasswordReset,
  resendCustomerPasswordResetOtp,
  confirmCustomerPasswordReset,
  verifyCustomerOtp,
  resendCustomerOtp,
};
