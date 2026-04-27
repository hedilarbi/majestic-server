const mongoose = require("mongoose");

const SpaceReservationRequest = require("../models/SpaceReservationRequest");
const {
  createSpaceReservationRequestNotification,
} = require("./dashboardNotificationService");

const ALLOWED_ESTABLISHMENT_TYPES = new Set(["association", "organisation"]);

const normalizeString = (value) => {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
};

const normalizeEmail = (value) => normalizeString(value).toLowerCase();

const normalizeEstablishmentType = (value) => {
  const normalized = normalizeString(value).toLowerCase();
  return ALLOWED_ESTABLISHMENT_TYPES.has(normalized) ? normalized : "";
};

const normalizeDate = (value) => {
  if (!value) {
    return null;
  }

  const dateValue = new Date(value);
  return Number.isNaN(dateValue.getTime()) ? null : dateValue;
};

const buildError = (message, status = 400) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const assertValidId = (id, label = "Demande") => {
  if (!id || !mongoose.isValidObjectId(id)) {
    throw buildError(`${label} invalide.`, 400);
  }
};

const buildCreatePayload = (payload = {}) => {
  const firstName = normalizeString(payload.firstName);
  const lastName = normalizeString(payload.lastName);
  const phone = normalizeString(payload.phone);
  const email = normalizeEmail(payload.email);
  const establishmentType = normalizeEstablishmentType(payload.establishmentType);
  const description = normalizeString(payload.description);
  const reservationDateTime = normalizeDate(payload.reservationDateTime);

  if (!firstName || !lastName) {
    throw buildError("Le nom et le prénom sont obligatoires.");
  }

  if (!phone) {
    throw buildError("Le numéro de téléphone est obligatoire.");
  }

  if (!email || !email.includes("@")) {
    throw buildError("Un email valide est obligatoire.");
  }

  if (!establishmentType) {
    throw buildError("Le type d'établissement est invalide.");
  }

  if (!reservationDateTime) {
    throw buildError("La date de réservation est invalide.");
  }

  if (!description) {
    throw buildError("La description est obligatoire.");
  }

  return {
    firstName,
    lastName,
    phone,
    email,
    establishmentType,
    reservationDateTime,
    description,
  };
};

const createSpaceReservationRequest = async (payload = {}, { io } = {}) => {
  const data = buildCreatePayload(payload);
  const item = await SpaceReservationRequest.create(data);

  try {
    await createSpaceReservationRequestNotification(item, { io });
  } catch (error) {
    console.error(
      `[space-reservation-request] notification failed for request ${item._id}`,
      error && error.stack ? error.stack : error,
    );
  }

  return item;
};

const listSpaceReservationRequests = async ({ status } = {}) => {
  const filters = {};
  const normalizedStatus = normalizeString(status).toLowerCase();

  if (normalizedStatus) {
    if (!["pending", "processed"].includes(normalizedStatus)) {
      throw buildError("Le statut est invalide.");
    }

    filters.status = normalizedStatus;
  }

  return SpaceReservationRequest.find(filters)
    .populate("processedBy", "firstName lastName email")
    .sort({ createdAt: -1, _id: -1 });
};

const getSpaceReservationRequestById = async (id) => {
  assertValidId(id);

  const item = await SpaceReservationRequest.findById(id).populate(
    "processedBy",
    "firstName lastName email",
  );

  if (!item) {
    throw buildError("Demande introuvable.", 404);
  }

  return item;
};

const markSpaceReservationRequestProcessed = async (id, userId) => {
  const item = await getSpaceReservationRequestById(id);

  if (item.status === "processed") {
    return item;
  }

  if (!userId || !mongoose.isValidObjectId(userId)) {
    throw buildError("Utilisateur de traitement invalide.", 400);
  }

  item.status = "processed";
  item.processedAt = new Date();
  item.processedBy = userId;
  await item.save();
  await item.populate("processedBy", "firstName lastName email");

  return item;
};

const deleteSpaceReservationRequest = async (id) => {
  assertValidId(id);

  const item = await SpaceReservationRequest.findByIdAndDelete(id);

  if (!item) {
    throw buildError("Demande introuvable.", 404);
  }

  return item;
};

module.exports = {
  createSpaceReservationRequest,
  deleteSpaceReservationRequest,
  getSpaceReservationRequestById,
  listSpaceReservationRequests,
  markSpaceReservationRequestProcessed,
};
