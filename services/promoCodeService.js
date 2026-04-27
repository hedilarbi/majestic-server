const mongoose = require("mongoose");

const PromoCode = require("../models/PromoCode");
const Booking = require("../models/Booking");

const normalizeNumber = (value) => {
  if (value === undefined || value === null || value === "") {
    return value;
  }

  const numberValue = Number(value);
  return Number.isNaN(numberValue) ? value : numberValue;
};

const normalizeUsageLimit = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const numberValue = Number(value);
  return Number.isNaN(numberValue) ? value : numberValue;
};

const normalizeDate = (value) => {
  if (value === undefined || value === null || value === "") {
    return value;
  }

  const dateValue = new Date(value);
  return Number.isNaN(dateValue.getTime()) ? value : dateValue;
};

const normalizePromoCode = (value) => {
  if (typeof value !== "string") {
    return "";
  }

  const normalized = value.trim().toUpperCase().replace(/\s+/g, "");
  if (!normalized) {
    return "";
  }

  if (!/^[A-Z0-9-]{2,64}$/.test(normalized)) {
    return "";
  }

  return normalized;
};

const PROMO_CODE_PATTERN = /^[A-Z]{3}\d{3}$/;
const ALLOWED_AVAILABILITIES = new Set(["public", "private"]);

const normalizeAvailability = (value, fallback = "public") => {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  return ALLOWED_AVAILABILITIES.has(normalized) ? normalized : fallback;
};

const generatePromoCodeCandidate = () => {
  const letters = Array.from({ length: 3 }, () =>
    String.fromCharCode(65 + Math.floor(Math.random() * 26)),
  ).join("");
  const digits = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, "0");

  return `${letters}${digits}`;
};

const toAmount = (value) => {
  const numeric = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const roundAmount = (value) => Math.round(toAmount(value) * 1000) / 1000;

const withSession = (query, dbSession) => {
  if (dbSession) {
    return query.session(dbSession);
  }
  return query;
};

const computeDiscountAmount = ({ subtotalAmount, reductionType, reductionValue }) => {
  const subtotal = Math.max(roundAmount(subtotalAmount), 0);
  const normalizedReduction = Math.max(roundAmount(reductionValue), 0);

  if (subtotal <= 0 || normalizedReduction <= 0) {
    return 0;
  }

  if (reductionType === "percent") {
    return Math.min(roundAmount((subtotal * normalizedReduction) / 100), subtotal);
  }

  return Math.min(normalizedReduction, subtotal);
};

const resolveUsageIdentity = ({ userId, userRole, customerContact }) => {
  if (userRole === "customer" && userId && mongoose.isValidObjectId(userId)) {
    return { kind: "userId", value: userId };
  }

  const email = String(customerContact?.email || "")
    .trim()
    .toLowerCase();
  if (email) {
    return { kind: "email", value: email };
  }

  return null;
};

const buildUsageQueryByIdentity = (identity) => {
  if (!identity || !identity.kind || !identity.value) {
    return null;
  }

  if (identity.kind === "userId") {
    return { userId: identity.value };
  }

  if (identity.kind === "email") {
    return { "customerContact.email": identity.value };
  }

  return null;
};

const validatePromoCodeForCheckout = async ({
  promoCode,
  subtotalAmount,
  userId,
  userRole,
  customerContact,
  dbSession,
}) => {
  const normalizedCode = normalizePromoCode(promoCode);
  if (!normalizedCode) {
    const error = new Error("Code promo invalide.");
    error.status = 400;
    throw error;
  }

  const now = new Date();
  const promoDoc = await withSession(
    PromoCode.findOne({ code: normalizedCode }),
    dbSession,
  );

  if (!promoDoc) {
    const error = new Error("Code promo introuvable.");
    error.status = 404;
    throw error;
  }

  if (promoDoc.isActive === false) {
    const error = new Error("Ce code promo n'est plus actif.");
    error.status = 409;
    throw error;
  }

  if (promoDoc.expiresAt && new Date(promoDoc.expiresAt).getTime() < now.getTime()) {
    const error = new Error("Ce code promo est expiré.");
    error.status = 409;
    throw error;
  }

  const usageBaseQuery = {
    "promotion.code": normalizedCode,
    status: { $in: ["confirmed", "used"] },
  };

  const totalUsageLimit = Number.isFinite(promoDoc.totalUsageLimit)
    ? Number(promoDoc.totalUsageLimit)
    : null;
  const userUsageLimit = Number.isFinite(promoDoc.userUsageLimit)
    ? Number(promoDoc.userUsageLimit)
    : null;

  let totalUsedCount = 0;
  if (totalUsageLimit !== null) {
    totalUsedCount = await withSession(
      Booking.countDocuments(usageBaseQuery),
      dbSession,
    );
    if (totalUsedCount >= totalUsageLimit) {
      const error = new Error("Ce code promo a atteint sa limite d'utilisation.");
      error.status = 409;
      throw error;
    }
  }

  const identity = resolveUsageIdentity({ userId, userRole, customerContact });
  let identityUsedCount = null;
  if (userUsageLimit !== null && identity) {
    const identityQuery = buildUsageQueryByIdentity(identity);
    if (identityQuery) {
      identityUsedCount = await withSession(
        Booking.countDocuments({
          ...usageBaseQuery,
          ...identityQuery,
        }),
        dbSession,
      );
      if (identityUsedCount >= userUsageLimit) {
        const error = new Error(
          "Vous avez atteint la limite d'utilisation de ce code promo.",
        );
        error.status = 409;
        throw error;
      }
    }
  }

  const subtotal = Math.max(roundAmount(subtotalAmount), 0);
  const discountAmount = computeDiscountAmount({
    subtotalAmount: subtotal,
    reductionType: promoDoc.reductionType,
    reductionValue: promoDoc.reductionValue,
  });
  const amountAfterDiscount = Math.max(roundAmount(subtotal - discountAmount), 0);

  return {
    promo: {
      code: promoDoc.code,
      reductionType: promoDoc.reductionType,
      reductionValue: promoDoc.reductionValue,
      expiresAt: promoDoc.expiresAt || null,
      totalUsageLimit:
        totalUsageLimit !== null ? totalUsageLimit : promoDoc.totalUsageLimit ?? null,
      userUsageLimit:
        userUsageLimit !== null ? userUsageLimit : promoDoc.userUsageLimit ?? null,
    },
    pricing: {
      amountBeforeDiscount: subtotal,
      discountAmount,
      amountAfterDiscount,
    },
    usage: {
      totalUsedCount,
      identityUsedCount,
      identityKind: identity?.kind || null,
      userLimitUnchecked: userUsageLimit !== null && !identity,
    },
  };
};

const normalizePayload = (payload) => {
  const data = {};

  if (Object.prototype.hasOwnProperty.call(payload, "code")) {
    data.code = String(payload.code || "").trim().toUpperCase();
  }
  if (Object.prototype.hasOwnProperty.call(payload, "reductionValue")) {
    data.reductionValue = normalizeNumber(payload.reductionValue);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "reductionType")) {
    data.reductionType = payload.reductionType;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "expiresAt")) {
    data.expiresAt = normalizeDate(payload.expiresAt);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "totalUsageLimit")) {
    data.totalUsageLimit = normalizeUsageLimit(payload.totalUsageLimit);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "userUsageLimit")) {
    data.userUsageLimit = normalizeUsageLimit(payload.userUsageLimit);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "isActive")) {
    data.isActive = Boolean(payload.isActive);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "availability")) {
    data.availability = normalizeAvailability(payload.availability);
  }

  return data;
};

const validatePayload = (data, { isUpdate } = {}) => {
  if (!isUpdate) {
    if (!data.code) {
      const error = new Error("code is required");
      error.status = 400;
      throw error;
    }
    if (data.reductionValue === undefined || data.reductionValue === null) {
      const error = new Error("reductionValue is required");
      error.status = 400;
      throw error;
    }
    if (!data.reductionType) {
      const error = new Error("reductionType is required");
      error.status = 400;
      throw error;
    }
    if (!data.expiresAt) {
      const error = new Error("expiresAt is required");
      error.status = 400;
      throw error;
    }
  }

  if (data.reductionType && !["amount", "percent"].includes(data.reductionType)) {
    const error = new Error("Invalid reductionType");
    error.status = 400;
    throw error;
  }

  if (data.code && !PROMO_CODE_PATTERN.test(data.code)) {
    const error = new Error(
      "Le code promo doit contenir 3 lettres majuscules suivies de 3 chiffres.",
    );
    error.status = 400;
    throw error;
  }

  if (
    Object.prototype.hasOwnProperty.call(data, "availability") &&
    !ALLOWED_AVAILABILITIES.has(data.availability)
  ) {
    const error = new Error("Availability invalide");
    error.status = 400;
    throw error;
  }
};

const generateUniquePromoCode = async () => {
  let attempts = 0;

  while (attempts < 50) {
    const candidate = generatePromoCodeCandidate();
    const existing = await PromoCode.findOne({ code: candidate })
      .select("_id")
      .lean();

    if (!existing) {
      return candidate;
    }

    attempts += 1;
  }

  const error = new Error("Impossible de générer un code promo unique.");
  error.status = 500;
  throw error;
};

const createPromoCode = async (payload) => {
  const data = normalizePayload(payload || {});
  validatePayload(data, { isUpdate: false });

  try {
    const promoCode = await PromoCode.create(data);
    return promoCode;
  } catch (error) {
    if (error && error.code === 11000) {
      const conflict = new Error("Promo code already exists");
      conflict.status = 409;
      throw conflict;
    }
    throw error;
  }
};

const listPromoCodes = async () => {
  return PromoCode.find().sort({ createdAt: -1 });
};

const getPromoCodeById = async (id) => {
  if (!mongoose.isValidObjectId(id)) {
    const error = new Error("Invalid promo code id");
    error.status = 400;
    throw error;
  }

  const promoCode = await PromoCode.findById(id);
  if (!promoCode) {
    const error = new Error("Promo code not found");
    error.status = 404;
    throw error;
  }

  return promoCode;
};

const updatePromoCode = async (id, payload) => {
  if (!mongoose.isValidObjectId(id)) {
    const error = new Error("Invalid promo code id");
    error.status = 400;
    throw error;
  }

  const data = normalizePayload(payload || {});
  validatePayload(data, { isUpdate: true });

  if (Object.keys(data).length === 0) {
    const error = new Error("No valid fields provided for update");
    error.status = 400;
    throw error;
  }

  try {
    const promoCode = await PromoCode.findByIdAndUpdate(id, data, {
      new: true,
      runValidators: true,
    });

    if (!promoCode) {
      const error = new Error("Promo code not found");
      error.status = 404;
      throw error;
    }

    return promoCode;
  } catch (error) {
    if (error && error.code === 11000) {
      const conflict = new Error("Promo code already exists");
      conflict.status = 409;
      throw conflict;
    }
    throw error;
  }
};

const deletePromoCode = async (id) => {
  if (!mongoose.isValidObjectId(id)) {
    const error = new Error("Invalid promo code id");
    error.status = 400;
    throw error;
  }

  const promoCode = await PromoCode.findByIdAndDelete(id);
  if (!promoCode) {
    const error = new Error("Promo code not found");
    error.status = 404;
    throw error;
  }

  return promoCode;
};

module.exports = {
  createPromoCode,
  listPromoCodes,
  getPromoCodeById,
  updatePromoCode,
  deletePromoCode,
  normalizePromoCode,
  validatePromoCodeForCheckout,
  generateUniquePromoCode,
};
