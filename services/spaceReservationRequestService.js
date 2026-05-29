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
    organisationName: normalizeString(payload.organisationName),
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

const replyToSpaceReservationRequest = async (id, { subject, message }) => {
  const item = await getSpaceReservationRequestById(id);

  const normalizedSubject = normalizeString(subject);
  const normalizedMessage = normalizeString(message);

  if (!normalizedSubject || !normalizedMessage) {
    throw buildError("Le sujet et le message sont requis.");
  }

  if (!item.email) {
    throw buildError("Adresse email du demandeur introuvable.", 404);
  }

  // Lazy-load nodemailer (same pattern as other email services)
  const nodemailer = require("nodemailer");

  const smtpUser =
    (process.env.SMTP_USER || process.env.EMAIL_SMTP_USER || process.env.GMAIL_USER || "").trim();
  const smtpPass =
    (process.env.SMTP_PASS || process.env.EMAIL_SMTP_PASS || process.env.GMAIL_APP_PASSWORD || "").trim();

  if (!smtpUser || !smtpPass) {
    throw buildError("Configuration email manquante (SMTP_USER / SMTP_PASS).", 500);
  }

  const host = (process.env.SMTP_HOST || "").trim();
  const port = parseInt(process.env.SMTP_PORT, 10) || 587;
  const secureFlag = String(process.env.SMTP_SECURE || "").trim().toLowerCase();
  const secure = secureFlag ? secureFlag === "true" : port === 465;

  const transporter = host
    ? nodemailer.createTransport({ host, port, secure, auth: { user: smtpUser, pass: smtpPass } })
    : nodemailer.createTransport({ service: "gmail", auth: { user: smtpUser, pass: smtpPass } });

  const fromAddress =
    (process.env.OTP_EMAIL_FROM || process.env.TICKETS_EMAIL_FROM || smtpUser).trim();
  const fullName = `${item.firstName || ""} ${item.lastName || ""}`.trim();

  const htmlBody = `
    <!doctype html>
    <html lang="fr">
    <head><meta charset="UTF-8"/><title>${normalizedSubject}</title></head>
    <body style="margin:0;padding:0;background:#f3f7fb;font-family:Arial,sans-serif;color:#0f172a;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f3f7fb;padding:32px 20px;">
        <tr><td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:640px;background:#ffffff;border:1px solid #d7e3f2;border-radius:20px;overflow:hidden;">
            <tr>
              <td style="padding:24px 28px;background:linear-gradient(135deg,#74d0f1,#1034a6);">
                <div style="font-size:22px;font-weight:700;color:#fff;">${normalizedSubject}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 28px;">
                <p style="font-size:14px;color:#334155;margin:0 0 12px;">Bonjour ${fullName || "Madame, Monsieur"},</p>
                <div style="font-size:14px;color:#334155;line-height:1.8;white-space:pre-wrap;">${normalizedMessage.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
                <p style="font-size:12px;color:#94a3b8;margin-top:24px;border-top:1px solid #e2e8f0;padding-top:14px;">Le Majestic — réponse automatique à votre demande de réservation.</p>
              </td>
            </tr>
          </table>
        </td></tr>
      </table>
    </body>
    </html>
  `;

  await transporter.sendMail({
    from: fromAddress,
    to: item.email,
    subject: normalizedSubject,
    text: `${normalizedMessage}\n\n-- Le Majestic`,
    html: htmlBody,
  });

  return { sent: true, recipient: item.email };
};

module.exports = {
  createSpaceReservationRequest,
  deleteSpaceReservationRequest,
  getSpaceReservationRequestById,
  listSpaceReservationRequests,
  markSpaceReservationRequestProcessed,
  replyToSpaceReservationRequest,
};
