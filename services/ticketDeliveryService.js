const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");

const Booking = require("../models/Booking");
const Ticket = require("../models/Ticket");
const Room = require("../models/Room");

let cachedTransporter = null;
let cachedNodemailer = null;
let cachedPdfKit = null;
let cachedQrCode = null;
let cachedLogoAttachment = undefined;

const queue = [];
let queueProcessing = false;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LOGO_CID = "majestic-logo";

const normalizeText = (value) => (typeof value === "string" ? value.trim() : "");

const normalizeEmail = (value) => {
  const email = normalizeText(value).toLowerCase();
  return EMAIL_REGEX.test(email) ? email : "";
};

const toPositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const isFeatureEnabled = () =>
  !["false", "0", "off"].includes(
    String(process.env.TICKETS_EMAIL_ENABLED || "true").trim().toLowerCase(),
  );

const getMaxAttempts = () =>
  toPositiveInt(process.env.TICKETS_EMAIL_MAX_ATTEMPTS, 3);

const getRetryDelayMs = (attempt) => {
  const baseDelay = toPositiveInt(process.env.TICKETS_EMAIL_RETRY_DELAY_MS, 8000);
  return baseDelay * Math.max(attempt, 1);
};

const getNodemailer = () => {
  if (cachedNodemailer) {
    return cachedNodemailer;
  }
  cachedNodemailer = require("nodemailer");
  return cachedNodemailer;
};

const getPdfKit = () => {
  if (cachedPdfKit) {
    return cachedPdfKit;
  }
  cachedPdfKit = require("pdfkit");
  return cachedPdfKit;
};

const getQrCode = () => {
  if (cachedQrCode) {
    return cachedQrCode;
  }
  cachedQrCode = require("qrcode");
  return cachedQrCode;
};

const toSafeFileToken = (value, fallback = "ticket") => {
  const token = normalizeText(value)
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9_-]/g, "");
  return token || fallback;
};

const getLogoAttachment = () => {
  if (cachedLogoAttachment !== undefined) {
    return cachedLogoAttachment;
  }

  const envLogoPath = normalizeText(process.env.TICKETS_EMAIL_LOGO_PATH);
  const candidates = [
    ...(envLogoPath ? [path.resolve(envLogoPath)] : []),
    path.resolve(__dirname, "../../majestic-client/public/images/logo.png"),
    path.resolve(process.cwd(), "../majestic-client/public/images/logo.png"),
    path.resolve(process.cwd(), "public/images/logo.png"),
  ];

  for (const candidate of candidates) {
    try {
      if (!fs.existsSync(candidate)) {
        continue;
      }
      const content = fs.readFileSync(candidate);
      cachedLogoAttachment = {
        filename: "logo.png",
        content,
        cid: LOGO_CID,
        contentType: "image/png",
      };
      return cachedLogoAttachment;
    } catch (_error) {
      continue;
    }
  }

  cachedLogoAttachment = null;
  return cachedLogoAttachment;
};

const getTransporter = () => {
  if (cachedTransporter) {
    return cachedTransporter;
  }

  const user =
    normalizeText(process.env.SMTP_USER) ||
    normalizeText(process.env.EMAIL_SMTP_USER) ||
    normalizeText(process.env.GMAIL_USER);
  const pass =
    normalizeText(process.env.SMTP_PASS) ||
    normalizeText(process.env.EMAIL_SMTP_PASS) ||
    normalizeText(process.env.GMAIL_APP_PASSWORD);

  if (!user || !pass) {
    const error = new Error(
      "SMTP credentials missing. Set SMTP_USER and SMTP_PASS (or GMAIL_APP_PASSWORD).",
    );
    error.status = 500;
    error.code = "SMTP_CONFIG_MISSING";
    throw error;
  }

  const nodemailer = getNodemailer();
  const host = normalizeText(process.env.SMTP_HOST);
  const port = toPositiveInt(process.env.SMTP_PORT, 587);
  const secureFlag = String(process.env.SMTP_SECURE || "")
    .trim()
    .toLowerCase();
  const secure = secureFlag ? secureFlag === "true" : port === 465;

  cachedTransporter = host
    ? nodemailer.createTransport({
        host,
        port,
        secure,
        auth: { user, pass },
      })
    : nodemailer.createTransport({
        service: "gmail",
        auth: { user, pass },
      });

  return cachedTransporter;
};

const formatDate = (value) => {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "2-digit",
  }).format(date);
};

const formatDateTime = (value) => {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const datePart = new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
  const timePart = new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);

  return `${datePart} à ${timePart}`;
};

const formatCurrency = (value) => {
  const amount =
    typeof value === "number" ? value : Number.parseFloat(String(value));
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  return `${safeAmount.toFixed(2)} DT`;
};

const resolvePosterSource = (session) => {
  const event =
    session?.eventId && typeof session.eventId === "object" ? session.eventId : null;

  return (
    normalizeText(event?.poster) ||
    normalizeText(event?.affiche) ||
    normalizeText(event?.image) ||
    normalizeText(session?.poster)
  );
};

const fetchImageBuffer = async (source) => {
  const safeSource = normalizeText(source);
  if (!safeSource) {
    return null;
  }

  try {
    if (/^https?:\/\//i.test(safeSource)) {
      const response = await fetch(safeSource);
      if (!response.ok) {
        return null;
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    }

    const directPath = path.isAbsolute(safeSource)
      ? safeSource
      : path.resolve(process.cwd(), safeSource);

    if (fs.existsSync(directPath)) {
      return fs.readFileSync(directPath);
    }
  } catch (_error) {
    return null;
  }

  return null;
};

const buildEventPosterBuffer = async (session) =>
  fetchImageBuffer(resolvePosterSource(session));

const resolveRoomName = async (roomId) => {
  const rawRoomId = normalizeText(roomId);
  if (!rawRoomId) {
    return "Salle";
  }

  if (mongoose.isValidObjectId(rawRoomId)) {
    const room = await Room.findById(rawRoomId).select("name").lean();
    if (room && room.name) {
      return room.name;
    }
  }

  return rawRoomId;
};

const resolveCustomer = (booking) => {
  const customerUser =
    booking.userId && typeof booking.userId === "object" ? booking.userId : null;
  const customerContact =
    booking.customerContact && typeof booking.customerContact === "object"
      ? booking.customerContact
      : null;

  const email =
    normalizeEmail(customerContact?.email) || normalizeEmail(customerUser?.email);
  const firstName =
    normalizeText(customerContact?.firstName) ||
    normalizeText(customerUser?.firstName);
  const lastName =
    normalizeText(customerContact?.lastName) || normalizeText(customerUser?.lastName);
  const fullName = `${firstName} ${lastName}`.trim() || "Client";

  return { email, fullName };
};

const buildTicketQrPayload = ({ ticket }) => normalizeText(ticket?.code);

const buildTicketQrBuffer = async (ticket) => {
  const QRCode = getQrCode();
  const payload = buildTicketQrPayload({ ticket });

  return QRCode.toBuffer(payload, {
    type: "png",
    width: 280,
    margin: 1,
    errorCorrectionLevel: "M",
  });
};

const renderTicketPdfPage = ({
  doc,
  booking,
  session,
  roomName,
  customerName,
  customerEmail,
  ticket,
  ticketIndex,
  totalTickets,
  qrBuffer,
  posterBuffer,
}) => {
  doc.addPage({
    size: "A4",
    layout: "landscape",
    margin: 0,
  });
  const { width, height } = doc.page;

  const event =
    session?.eventId && typeof session.eventId === "object" ? session.eventId : null;
  const eventName = normalizeText(event?.name) || "Événement";
  const sessionDate = formatDate(session?.date);
  const sessionTime = normalizeText(session?.sessionTime) || "";
  const bookingCode = normalizeText(booking?.bookingNumber) || "N/A";
  const bookingCreatedAt = formatDateTime(booking?.createdAt);
  const seatLabel = `${ticket?.seat?.row || ""}${ticket?.seat?.col ?? ""}`;
  const ticketCode = normalizeText(ticket?.code) || "-";
  const performedBy = normalizeEmail(customerEmail) || normalizeText(customerName) || "Client";
  const pageMargin = 24;
  const cardX = pageMargin;
  const cardY = pageMargin;
  const cardWidth = width - pageMargin * 2;
  const cardHeight = height - pageMargin * 2;
  const leftWidth = 286;
  const rightWidth = cardWidth - leftWidth;
  const leftX = cardX;
  const rightX = cardX + leftWidth;
  const posterX = leftX + 18;
  const posterY = cardY + 18;
  const posterWidth = leftWidth - 36;
  const posterHeight = 278;
  const seatBadgeY = cardY + cardHeight - 92;
  const infoY = posterY + posterHeight + 18;

  doc.rect(0, 0, width, height).fill("#eef3fb");

  doc
    .roundedRect(cardX, cardY, cardWidth, cardHeight, 18)
    .lineWidth(1)
    .fillAndStroke("#ffffff", "#d5dfef");

  doc
    .roundedRect(leftX, cardY, leftWidth, cardHeight, 18)
    .fill("#0d1e3d");
  doc
    .rect(leftX + leftWidth - 20, cardY, 20, cardHeight)
    .fill("#0d1e3d");

  if (posterBuffer) {
    doc.save();
    doc.roundedRect(posterX, posterY, posterWidth, posterHeight, 14).clip();
    doc.image(posterBuffer, posterX, posterY, {
      fit: [posterWidth, posterHeight],
      align: "center",
      valign: "center",
    });
    doc.restore();
  } else {
    const fallbackGradient = doc.linearGradient(
      posterX,
      posterY,
      posterX + posterWidth,
      posterY + posterHeight,
    );
    fallbackGradient.stop(0, "#1034a6").stop(1, "#74d0f1");
    doc
      .roundedRect(posterX, posterY, posterWidth, posterHeight, 14)
      .fill(fallbackGradient);
    doc
      .fillColor("#ffffff")
      .font("Helvetica-Bold")
      .fontSize(24)
      .text("LE MAJESTIC", posterX + 24, posterY + 120, {
        width: posterWidth - 48,
        align: "center",
      });
  }

  doc
    .fillColor("#ffffff")
    .font("Helvetica-Bold")
    .fontSize(22)
    .text(eventName, leftX + 18, infoY, {
      width: leftWidth - 36,
      align: "left",
    });

  doc
    .fillColor("#c8d8f5")
    .font("Helvetica")
    .fontSize(12)
    .text(
      `${sessionDate}${sessionTime ? ` - ${sessionTime}` : ""}`,
      leftX + 18,
      infoY + 48,
      {
        width: leftWidth - 36,
      },
    );

  doc
    .roundedRect(leftX + 18, seatBadgeY, leftWidth - 36, 54, 14)
    .fill("#74d0f1");
  doc
    .fillColor("#0d1e3d")
    .font("Helvetica-Bold")
    .fontSize(12)
    .text("Numéro du siège", leftX + 36, seatBadgeY + 10, {
      width: leftWidth - 72,
      align: "center",
    });
  doc
    .font("Helvetica-Bold")
    .fontSize(24)
    .text(seatLabel || "-", leftX + 36, seatBadgeY + 24, {
      width: leftWidth - 72,
      align: "center",
    });

  doc
    .strokeColor("#d5dfef")
    .lineWidth(1)
    .moveTo(rightX, cardY + 22)
    .lineTo(rightX, cardY + cardHeight - 22)
    .stroke();

  doc
    .fillColor("#1034a6")
    .font("Helvetica-Bold")
    .fontSize(12)
    .text("Billet électronique", rightX + 28, cardY + 26, {
      width: rightWidth - 56,
    });

  doc
    .fillColor("#111827")
    .font("Helvetica-Bold")
    .fontSize(15)
    .text(`N° de réservation : ${bookingCode}`, rightX + 28, cardY + 60, {
      width: rightWidth - 56,
    });

  doc
    .fillColor("#4b5563")
    .font("Helvetica")
    .fontSize(11)
    .text(`Commande effectuée par ${performedBy} le`, rightX + 28, cardY + 94, {
      width: rightWidth - 56,
    });

  doc
    .fillColor("#111827")
    .font("Helvetica-Bold")
    .fontSize(14)
    .text(bookingCreatedAt || "-", rightX + 28, cardY + 114, {
      width: rightWidth - 56,
    });

  const qrBoxSize = 172;
  const qrBoxX = rightX + 28;
  const qrBoxY = cardY + 154;
  doc
    .roundedRect(qrBoxX, qrBoxY, qrBoxSize, qrBoxSize, 14)
    .fillAndStroke("#f8fbff", "#d5dfef");
  doc.image(qrBuffer, qrBoxX + 16, qrBoxY + 16, {
    width: qrBoxSize - 32,
    height: qrBoxSize - 32,
  });

  const pricingBoxX = qrBoxX + qrBoxSize + 20;
  const pricingBoxWidth = rightWidth - (pricingBoxX - rightX) - 28;
  const pricingBoxHeight = 108;
  const codeBoxY = qrBoxY + pricingBoxHeight + 16;
  doc
    .roundedRect(pricingBoxX, qrBoxY, pricingBoxWidth, pricingBoxHeight, 14)
    .fill("#f3f7fe");
  doc
    .fillColor("#6b7280")
    .font("Helvetica-Bold")
    .fontSize(10)
    .text("TARIF", pricingBoxX + 16, qrBoxY + 14, { width: pricingBoxWidth - 32 });
  doc
    .fillColor("#111827")
    .font("Helvetica-Bold")
    .fontSize(16)
    .text(normalizeText(ticket?.pricingName) || "Tarif", pricingBoxX + 16, qrBoxY + 30, {
      width: pricingBoxWidth - 32,
    });
  doc
    .fillColor("#6b7280")
    .font("Helvetica-Bold")
    .fontSize(10)
    .text("PRIX", pricingBoxX + 16, qrBoxY + 66, { width: pricingBoxWidth - 32 });
  doc
    .fillColor("#1034a6")
    .font("Helvetica-Bold")
    .fontSize(18)
    .text(formatCurrency(ticket?.price), pricingBoxX + 16, qrBoxY + 80, {
      width: pricingBoxWidth - 32,
    });

  doc
    .roundedRect(pricingBoxX, codeBoxY, pricingBoxWidth, 72, 14)
    .fill("#f8fbff");
  doc
    .fillColor("#6b7280")
    .font("Helvetica-Bold")
    .fontSize(10)
    .text("CODE BILLET", pricingBoxX + 16, codeBoxY + 14, {
      width: pricingBoxWidth - 32,
    });
  doc
    .fillColor("#111827")
    .font("Helvetica-Bold")
    .fontSize(15)
    .text(ticketCode, pricingBoxX + 16, codeBoxY + 32, {
      width: pricingBoxWidth - 32,
    });
  doc
    .fillColor("#6b7280")
    .font("Helvetica")
    .fontSize(10)
    .text(`Ticket ${ticketIndex + 1}/${totalTickets}`, pricingBoxX + 16, codeBoxY + 54, {
      width: pricingBoxWidth - 32,
    });

  doc
    .roundedRect(rightX + 28, cardY + cardHeight - 140, rightWidth - 56, 110, 14)
    .lineWidth(1)
    .fillAndStroke("#fff8f1", "#f5cfa8");
  doc
    .fillColor("#8a4b08")
    .font("Helvetica-Bold")
    .fontSize(10.5)
    .text(
      "Ce billet est unique - Une fois scanné à l'entrée, aucun autre exemplaire de ce billet ne sera accepté au contrôle. Conservez ce billet jusqu'à la fin de votre séance.",
      rightX + 44,
      cardY + cardHeight - 122,
      {
        width: rightWidth - 88,
        align: "left",
      },
    );
};

const buildTicketPdfBuffer = async ({
  booking,
  session,
  roomName,
  customerName,
  customerEmail,
  ticket,
  ticketIndex,
  totalTickets,
  posterBuffer,
}) => {
  const PDFDocument = getPdfKit();
  const [qrBuffer, resolvedPosterBuffer] = await Promise.all([
    buildTicketQrBuffer(ticket),
    posterBuffer === undefined ? buildEventPosterBuffer(session) : posterBuffer,
  ]);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      autoFirstPage: false,
      size: "A4",
      layout: "landscape",
      margin: 0,
      info: {
        Title: `Billet ${ticket?.code || ""}`,
        Author: "Majestic",
      },
    });

    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    renderTicketPdfPage({
      doc,
      booking,
      session,
      roomName,
      customerName,
      customerEmail,
      ticket,
      ticketIndex,
      totalTickets,
      qrBuffer,
      posterBuffer: resolvedPosterBuffer,
    });

    doc.end();
  });
};

const buildBookingTicketsPdfBuffer = async ({
  booking,
  session,
  roomName,
  customerName,
  customerEmail,
  tickets,
}) => {
  const PDFDocument = getPdfKit();
  const safeTickets = Array.isArray(tickets) ? tickets.filter(Boolean) : [];

  if (!safeTickets.length) {
    const error = new Error("No tickets to export");
    error.status = 400;
    throw error;
  }

  const [qrBuffers, posterBuffer] = await Promise.all([
    Promise.all(safeTickets.map((ticket) => buildTicketQrBuffer(ticket))),
    buildEventPosterBuffer(session),
  ]);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      autoFirstPage: false,
      size: "A4",
      layout: "landscape",
      margin: 0,
      info: {
        Title: `Billets ${booking?.bookingNumber || ""}`,
        Author: "Majestic",
      },
    });

    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    safeTickets.forEach((ticket, index) => {
      renderTicketPdfPage({
        doc,
        booking,
        session,
        roomName,
        customerName,
        customerEmail,
        ticket,
        ticketIndex: index,
        totalTickets: safeTickets.length,
        qrBuffer: qrBuffers[index],
        posterBuffer,
      });
    });

    doc.end();
  });
};

const buildTicketPdfAttachments = async ({
  booking,
  session,
  roomName,
  customerName,
  customerEmail,
  tickets,
}) => {
  const list = Array.isArray(tickets) ? tickets : [];
  const posterBuffer = await buildEventPosterBuffer(session);

  return Promise.all(
    list.map(async (ticket, index) => {
      const seatLabel = `${ticket?.seat?.row || ""}${ticket?.seat?.col ?? ""}`;
      const pdfBuffer = await buildTicketPdfBuffer({
        booking,
        session,
        roomName,
        customerName,
        customerEmail,
        ticket,
        ticketIndex: index,
        totalTickets: list.length || 1,
        posterBuffer,
      });

      const bookingToken = toSafeFileToken(booking?.bookingNumber, "booking");
      const seatToken = toSafeFileToken(seatLabel, `seat-${index + 1}`);
      const ticketCodeToken = toSafeFileToken(ticket?.code, `ticket-${index + 1}`);
      return {
        filename: `${bookingToken}-${seatToken}-${ticketCodeToken}.pdf`,
        content: pdfBuffer,
        contentType: "application/pdf",
      };
    }),
  );
};

const buildEmailHtml = ({
  customerName,
  booking,
  tickets,
  session,
  roomName,
  hasLogo,
  groupedPdf = false,
}) => {
  const event =
    session?.eventId && typeof session.eventId === "object" ? session.eventId : null;
  const eventName = normalizeText(event?.name) || "Événement";
  const sessionDate = formatDate(session?.date);
  const sessionTime = normalizeText(session?.sessionTime) || "";
  const safeTickets = Array.isArray(tickets) ? tickets : [];
  const seats = safeTickets
    .map((ticket) => `${ticket?.seat?.row || ""}${ticket?.seat?.col ?? ""}`)
    .filter(Boolean)
    .join(", ");
  const ticketsHtml = safeTickets
    .map((ticket) => {
      const seatLabel = `${ticket?.seat?.row || ""}${ticket?.seat?.col ?? ""}` || "-";
      const pricingName = normalizeText(ticket?.pricingName) || "Tarif";
      const ticketCode = normalizeText(ticket?.code) || "-";
      return `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #25304a;color:#d7e4ff;">${seatLabel}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #25304a;color:#d7e4ff;">${pricingName}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #25304a;color:#d7e4ff;">${formatCurrency(ticket?.price)}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #25304a;color:#9fb6d8;font-family:monospace;">${ticketCode}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <div style="margin:0;padding:24px 12px;background:#02050d;background-image:radial-gradient(circle at 12% 20%, rgba(16,52,166,0.28) 0%, transparent 40%),radial-gradient(circle at 88% 80%, rgba(116,208,241,0.2) 0%, transparent 40%);font-family:Arial,sans-serif;color:#f8fafc;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:700px;margin:0 auto;border:1px solid #25304a;border-radius:18px;overflow:hidden;background:#090f1d;">
        <tr>
          <td style="padding:20px 24px;background:linear-gradient(90deg,#74d0f1,#1034a6);">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td align="left" valign="middle">
                  ${
                    hasLogo
                      ? `<img src="cid:${LOGO_CID}" alt="Majestic" style="display:block;max-height:48px;width:auto;" />`
                      : `<div style="font-size:26px;font-weight:700;letter-spacing:2px;color:#fff;">MAJESTIC</div>`
                  }
                </td>
                <td align="right" valign="middle" style="color:#ffffff;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;">
                  Billets confirmés
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:24px;">
            <h2 style="margin:0 0 8px;font-size:24px;line-height:1.2;color:#ffffff;">Bonjour ${customerName},</h2>
            <p style="margin:0 0 18px;color:#9fb6d8;font-size:14px;line-height:1.6;">
              ${
                groupedPdf
                  ? "Votre achat est confirmé. Tous vos billets sont regroupés dans un seul PDF joint."
                  : "Votre achat est confirmé. Chaque billet est joint dans un PDF séparé."
              }
            </p>

            <div style="border:1px solid #25304a;border-radius:14px;padding:16px;background:#0f182c;">
              <p style="margin:0 0 7px;color:#d7e4ff;font-size:14px;"><strong>Code réservation :</strong> ${booking.bookingNumber || ""}</p>
              <p style="margin:0 0 7px;color:#d7e4ff;font-size:14px;"><strong>Événement :</strong> ${eventName}</p>
              <p style="margin:0 0 7px;color:#d7e4ff;font-size:14px;"><strong>Séance :</strong> ${sessionDate}${
                sessionTime ? ` - ${sessionTime}` : ""
              }</p>
              <p style="margin:0 0 7px;color:#d7e4ff;font-size:14px;"><strong>Salle :</strong> ${roomName || "Salle"}</p>
              <p style="margin:0;color:#d7e4ff;font-size:14px;"><strong>Sièges :</strong> ${seats || "-"}</p>
            </div>

            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-top:16px;border:1px solid #25304a;border-radius:12px;overflow:hidden;background:#0c1424;">
              <tr>
                <th align="left" style="padding:10px 12px;background:#121f37;color:#74d0f1;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Siège</th>
                <th align="left" style="padding:10px 12px;background:#121f37;color:#74d0f1;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Tarif</th>
                <th align="left" style="padding:10px 12px;background:#121f37;color:#74d0f1;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Prix</th>
                <th align="left" style="padding:10px 12px;background:#121f37;color:#74d0f1;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Code ticket</th>
              </tr>
              ${ticketsHtml}
            </table>

            <p style="margin:16px 0 0;color:#9fb6d8;font-size:13px;line-height:1.6;">
              Nombre de billets : <strong style="color:#ffffff;">${safeTickets.length}</strong><br />
              Nombre de PDF joints : <strong style="color:#ffffff;">${
                groupedPdf ? 1 : safeTickets.length
              }</strong><br />
              Présentez le QR code de chaque billet à l'entrée.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:14px 24px;border-top:1px solid #25304a;color:#6e85a8;font-size:12px;">
            Équipe Majestic - Merci pour votre confiance
          </td>
        </tr>
      </table>
    </div>
  `;
};

const buildEmailAttachments = async ({
  booking,
  session,
  roomName,
  customerName,
  customerEmail,
  tickets,
}) => {
  const sendGroupedPdf = String(booking?.bookingSource || "").toLowerCase() !== "ticket_office";
  let ticketAttachments;

  if (sendGroupedPdf) {
    const pdfBuffer = await buildBookingTicketsPdfBuffer({
      booking,
      session,
      roomName,
      customerName,
      customerEmail,
      tickets,
    });
    const bookingToken = toSafeFileToken(booking?.bookingNumber, "booking");
    ticketAttachments = [
      {
        filename: `${bookingToken}-billets.pdf`,
        content: pdfBuffer,
        contentType: "application/pdf",
      },
    ];
  } else {
    ticketAttachments = await buildTicketPdfAttachments({
      booking,
      session,
      roomName,
      customerName,
      customerEmail,
      tickets,
    });
  }

  const logoAttachment = getLogoAttachment();
  if (logoAttachment) {
    return {
      attachments: [...ticketAttachments, logoAttachment],
      hasLogo: true,
      groupedPdf: sendGroupedPdf,
    };
  }

  return {
    attachments: ticketAttachments,
    hasLogo: false,
    groupedPdf: sendGroupedPdf,
  };
};

const fetchBookingContext = async (bookingId) => {
  if (!bookingId || !mongoose.isValidObjectId(bookingId)) {
    const error = new Error("Invalid booking id");
    error.status = 400;
    throw error;
  }

  const booking = await Booking.findById(bookingId)
    .select("bookingNumber userId customerContact sessionId bookingSource createdAt")
    .populate({
      path: "sessionId",
      select: "date sessionTime roomId eventId",
      populate: { path: "eventId", select: "name poster affiche image" },
    })
    .populate({ path: "userId", select: "firstName lastName email" })
    .lean();

  if (!booking) {
    const error = new Error("Booking not found");
    error.status = 404;
    throw error;
  }

  const tickets = await Ticket.find({ bookingId: booking._id })
    .sort({ "seat.row": 1, "seat.col": 1, createdAt: 1 })
    .select("code seat pricingName price")
    .lean();

  if (!tickets.length) {
    const error = new Error("Tickets not generated yet");
    error.status = 409;
    throw error;
  }

  const session =
    booking.sessionId && typeof booking.sessionId === "object"
      ? booking.sessionId
      : null;
  const roomName = await resolveRoomName(session?.roomId);
  const customer = resolveCustomer(booking);

  return {
    booking,
    tickets,
    session,
    roomName,
    customer,
  };
};

const sendBookingTicketsEmail = async ({ bookingId }) => {
  if (!isFeatureEnabled()) {
    return { sent: false, skipped: true, reason: "EMAIL_DISABLED" };
  }

  const context = await fetchBookingContext(bookingId);
  const forceTo = normalizeEmail(process.env.TICKETS_EMAIL_FORCE_TO);
  const recipientEmail = forceTo || context.customer.email;

  if (!recipientEmail) {
    return { sent: false, skipped: true, reason: "NO_RECIPIENT_EMAIL" };
  }

  const transporter = getTransporter();
  const smtpUser =
    normalizeText(process.env.SMTP_USER) ||
    normalizeText(process.env.EMAIL_SMTP_USER) ||
    normalizeText(process.env.GMAIL_USER);
  const fromName = normalizeText(process.env.TICKETS_EMAIL_FROM_NAME) || "Majestic";
  const fromAddress = normalizeEmail(process.env.TICKETS_EMAIL_FROM) || smtpUser;
  const from = fromAddress ? `"${fromName}" <${fromAddress}>` : fromName;

  const emailAssets = await buildEmailAttachments({
    booking: context.booking,
    session: context.session,
    roomName: context.roomName,
    customerName: context.customer.fullName,
    customerEmail: context.customer.email,
    tickets: context.tickets,
  });

  const subject = `Vos billets - ${context.booking.bookingNumber || "Réservation"}`;
  const html = buildEmailHtml({
    customerName: context.customer.fullName,
    booking: context.booking,
    tickets: context.tickets,
    session: context.session,
    roomName: context.roomName,
    hasLogo: emailAssets.hasLogo,
    groupedPdf: emailAssets.groupedPdf,
  });

  await transporter.sendMail({
    from,
    to: recipientEmail,
    subject,
    html,
    attachments: emailAssets.attachments,
  });

  return {
    sent: true,
    recipient: recipientEmail,
    bookingNumber: context.booking.bookingNumber || "",
    ticketsCount: context.tickets.length,
  };
};

const buildTicketPdfDownload = async ({ ticketId, customerId } = {}) => {
  if (!ticketId || !mongoose.isValidObjectId(ticketId)) {
    const error = new Error("Invalid ticket id");
    error.status = 400;
    throw error;
  }

  const query = { _id: ticketId };
  if (customerId) {
    if (!mongoose.isValidObjectId(customerId)) {
      const error = new Error("Invalid user id");
      error.status = 400;
      throw error;
    }
    query.userId = customerId;
  }

  const ticket = await Ticket.findOne(query)
    .select("code seat pricingName price bookingId userId")
    .lean();

  if (!ticket) {
    const error = new Error("Ticket not found");
    error.status = 404;
    throw error;
  }

  const context = await fetchBookingContext(ticket.bookingId);
  const bookingUserId =
    context?.booking?.userId && typeof context.booking.userId === "object"
      ? context.booking.userId._id
      : context?.booking?.userId || null;

  if (
    customerId &&
    bookingUserId &&
    String(bookingUserId) !== String(customerId)
  ) {
    const error = new Error("Ticket not found");
    error.status = 404;
    throw error;
  }

  const contextTicket =
    context.tickets.find((item) => String(item._id) === String(ticket._id)) ||
    context.tickets.find((item) => String(item.code || "") === String(ticket.code || ""));
  const ticketForPdf = contextTicket || ticket;

  const pdfBuffer = await buildTicketPdfBuffer({
    booking: context.booking,
    session: context.session,
    roomName: context.roomName,
    customerName: context.customer.fullName,
    customerEmail: context.customer.email,
    ticket: ticketForPdf,
    ticketIndex: 0,
    totalTickets: 1,
  });

  const seatLabel = `${ticketForPdf?.seat?.row || ""}${ticketForPdf?.seat?.col ?? ""}`;
  const bookingToken = toSafeFileToken(context.booking?.bookingNumber, "booking");
  const seatToken = toSafeFileToken(seatLabel, "seat");
  const ticketCodeToken = toSafeFileToken(ticketForPdf?.code, "ticket");

  return {
    buffer: pdfBuffer,
    filename: `${bookingToken}-${seatToken}-${ticketCodeToken}.pdf`,
  };
};

const enqueueInternal = (job) => {
  queue.push(job);
  setImmediate(() => {
    void processQueue();
  });
};

const enqueueBookingTicketEmail = ({ bookingId }) => {
  if (!bookingId) {
    return;
  }
  enqueueInternal({ bookingId: String(bookingId), attempt: 1 });
};

const processQueue = async () => {
  if (queueProcessing) {
    return;
  }
  queueProcessing = true;

  try {
    while (queue.length > 0) {
      const job = queue.shift();
      try {
        await sendBookingTicketsEmail({ bookingId: job.bookingId });
      } catch (error) {
        const maxAttempts = getMaxAttempts();
        if (job.attempt < maxAttempts) {
          const nextAttempt = job.attempt + 1;
          const delay = getRetryDelayMs(job.attempt);
          setTimeout(() => {
            enqueueInternal({ bookingId: job.bookingId, attempt: nextAttempt });
          }, delay);
        } else {
          console.error(
            `[ticket-email] failed after ${job.attempt} attempts for booking ${job.bookingId}`,
            error && error.stack ? error.stack : error,
          );
        }
      }
    }
  } finally {
    queueProcessing = false;
    if (queue.length > 0) {
      setImmediate(() => {
        void processQueue();
      });
    }
  }
};

module.exports = {
  buildTicketPdfDownload,
  enqueueBookingTicketEmail,
  sendBookingTicketsEmail,
};
