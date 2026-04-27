const mongoose = require("mongoose");

const DashboardNotification = require("../models/DashboardNotification");

const DASHBOARD_NOTIFICATION_TYPE_SPACE_RESERVATION_REQUEST_CREATED =
  "space_reservation_request_created";

const normalizeString = (value) =>
  (typeof value === "string" ? value.trim() : "");

const normalizeObjectIdList = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
        .filter((entry) => entry && mongoose.isValidObjectId(entry)),
    ),
  );
};

const assertValidUserId = (userId) => {
  const normalizedUserId = normalizeString(userId);
  if (!normalizedUserId || !mongoose.isValidObjectId(normalizedUserId)) {
    const error = new Error("Utilisateur invalide");
    error.status = 400;
    throw error;
  }

  return normalizedUserId;
};

const formatDateTime = (value) => {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

const serializeDashboardNotification = (notification) => {
  if (!notification) {
    return null;
  }

  const source =
    typeof notification.toObject === "function"
      ? notification.toObject({ versionKey: false })
      : notification;

  return {
    id: String(source._id),
    type: source.type || "",
    title: source.title || "",
    message: source.message || "",
    link: source.link || "",
    entityType: source.entityType || "",
    entityId: source.entityId ? String(source.entityId) : "",
    metadata:
      source.metadata && typeof source.metadata === "object" ? source.metadata : {},
    createdAt: source.createdAt || null,
    updatedAt: source.updatedAt || null,
  };
};

const createDashboardNotification = async (payload = {}, { io } = {}) => {
  const title = normalizeString(payload.title);
  const message = normalizeString(payload.message);
  const type = normalizeString(payload.type);
  const link = normalizeString(payload.link);
  const entityType = normalizeString(payload.entityType);
  const entityId =
    payload.entityId && mongoose.isValidObjectId(payload.entityId)
      ? payload.entityId
      : null;

  if (!title || !message || !type) {
    const error = new Error("Notification invalide");
    error.status = 400;
    throw error;
  }

  const item = await DashboardNotification.create({
    audience: "dashboard",
    type,
    title,
    message,
    link,
    entityType,
    entityId,
    metadata:
      payload.metadata && typeof payload.metadata === "object" ? payload.metadata : {},
  });

  if (io && typeof io.emit === "function") {
    io.emit("dashboard-notification-created", {
      notificationId: String(item._id),
      type: item.type,
      audience: item.audience,
    });
  }

  return item;
};

const createSpaceReservationRequestNotification = async (
  request,
  { io } = {},
) => {
  if (!request?._id) {
    return null;
  }

  const firstName = normalizeString(request.firstName);
  const lastName = normalizeString(request.lastName);
  const fullName = `${firstName} ${lastName}`.trim() || "Client";
  const reservationDateLabel = formatDateTime(request.reservationDateTime);

  return createDashboardNotification(
    {
      type: DASHBOARD_NOTIFICATION_TYPE_SPACE_RESERVATION_REQUEST_CREATED,
      title: "Nouvelle demande de réservation",
      message: `${fullName} souhaite réserver un espace${reservationDateLabel ? ` le ${reservationDateLabel}` : ""}.`,
      link: `/demandes-reservation/${String(request._id)}`,
      entityType: "space_reservation_request",
      entityId: request._id,
      metadata: {
        requestId: String(request._id),
        firstName,
        lastName,
        fullName,
        email: normalizeString(request.email),
        phone: normalizeString(request.phone),
        establishmentType: normalizeString(request.establishmentType),
        reservationDateTime: request.reservationDateTime || null,
        status: normalizeString(request.status),
      },
    },
    { io },
  );
};

const listUnreadDashboardNotifications = async ({ userId }) => {
  const safeUserId = assertValidUserId(userId);

  const items = await DashboardNotification.find({
    audience: "dashboard",
    readBy: {
      $ne: new mongoose.Types.ObjectId(safeUserId),
    },
  }).sort({ createdAt: -1, _id: -1 });

  return items.map((item) => serializeDashboardNotification(item));
};

const markDashboardNotificationsRead = async ({ userId, notificationIds }) => {
  const safeUserId = assertValidUserId(userId);
  const normalizedIds = normalizeObjectIdList(notificationIds);

  if (normalizedIds.length === 0) {
    return { updatedCount: 0 };
  }

  const userObjectId = new mongoose.Types.ObjectId(safeUserId);
  const result = await DashboardNotification.updateMany(
    {
      _id: { $in: normalizedIds },
      audience: "dashboard",
      readBy: { $ne: userObjectId },
    },
    {
      $addToSet: {
        readBy: userObjectId,
      },
    },
  );

  return {
    updatedCount:
      typeof result.modifiedCount === "number"
        ? result.modifiedCount
        : result.nModified || 0,
  };
};

module.exports = {
  createDashboardNotification,
  createSpaceReservationRequestNotification,
  listUnreadDashboardNotifications,
  markDashboardNotificationsRead,
  DASHBOARD_NOTIFICATION_TYPE_SPACE_RESERVATION_REQUEST_CREATED,
};
