const fs = require("fs");
const path = require("path");

const SubscriptionSale = require("../models/SubscriptionSale");

let cachedTransporter = null;
let cachedNodemailer = null;
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
    String(process.env.SUBSCRIPTIONS_EMAIL_ENABLED || "true")
      .trim()
      .toLowerCase(),
  );

const getMaxAttempts = () =>
  toPositiveInt(process.env.SUBSCRIPTIONS_EMAIL_MAX_ATTEMPTS, 3);

const getRetryDelayMs = (attempt) => {
  const baseDelay = toPositiveInt(
    process.env.SUBSCRIPTIONS_EMAIL_RETRY_DELAY_MS,
    8000,
  );
  return baseDelay * Math.max(attempt, 1);
};

const getNodemailer = () => {
  if (cachedNodemailer) {
    return cachedNodemailer;
  }
  cachedNodemailer = require("nodemailer");
  return cachedNodemailer;
};

const getLogoAttachment = () => {
  if (cachedLogoAttachment !== undefined) {
    return cachedLogoAttachment;
  }

  const envLogoPath = normalizeText(process.env.SUBSCRIPTIONS_EMAIL_LOGO_PATH);
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
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

const formatCurrency = (value) => {
  const amount =
    typeof value === "number" ? value : Number.parseFloat(String(value));
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  return `${safeAmount.toFixed(2)} DT`;
};

const resolveRecipient = (sale) => {
  const user = sale?.userId && typeof sale.userId === "object" ? sale.userId : null;
  const contact =
    sale?.customerContact && typeof sale.customerContact === "object"
      ? sale.customerContact
      : null;

  const email = normalizeEmail(contact?.email) || normalizeEmail(user?.email);
  const firstName =
    normalizeText(contact?.firstName) || normalizeText(user?.firstName);
  const lastName =
    normalizeText(contact?.lastName) || normalizeText(user?.lastName);
  const fullName = `${firstName} ${lastName}`.trim() || "Client";

  return { email, fullName };
};

const buildEmailHtml = ({ sale, subscription, customerName, hasLogo }) => {
  const subscriptionName = normalizeText(subscription?.name) || "Abonnement";
  const code = normalizeText(sale?.subscriptionCode) || "N/A";
  const totalCredits = Number.isFinite(Number(sale?.totalCredits))
    ? Number(sale.totalCredits)
    : 0;
  const remainingCredits = Number.isFinite(Number(sale?.remainingCredits))
    ? Number(sale.remainingCredits)
    : 0;

  return `
    <div style="margin:0;padding:0;background:#04070f;color:#e5eefc;font-family:Arial,sans-serif;">
      <div style="max-width:680px;margin:0 auto;padding:32px 20px;">
        <div style="border-radius:24px;overflow:hidden;border:1px solid rgba(116,208,241,0.2);background:linear-gradient(180deg,#0a1020 0%,#060a14 100%);box-shadow:0 24px 80px rgba(1,6,18,0.55);">
          <div style="padding:28px 32px;background:linear-gradient(135deg,#1034a6 0%,#74d0f1 100%);">
            ${
              hasLogo
                ? `<img src="cid:${LOGO_CID}" alt="Majestic" style="height:54px;width:auto;display:block;margin-bottom:18px;" />`
                : ""
            }
            <div style="font-size:28px;line-height:1.1;font-weight:700;color:#ffffff;">
              Abonnement confirmé
            </div>
            <div style="margin-top:8px;font-size:14px;color:rgba(255,255,255,0.9);">
              Votre vente d'abonnement a bien ete enregistrée.
            </div>
          </div>

          <div style="padding:28px 32px;">
            <p style="margin:0 0 18px;font-size:15px;color:#dbe7ff;">
              Bonjour <strong style="color:#ffffff;">${customerName}</strong>,
            </p>
            <p style="margin:0 0 22px;font-size:14px;line-height:1.6;color:#9fb6d8;">
              Voici votre code d'abonnement. Ce code sera utilisé pour identifier votre abonnement lors de vos achats.
            </p>

            <div style="border-radius:18px;border:1px solid rgba(116,208,241,0.28);background:rgba(15,23,42,0.82);padding:22px 20px;text-align:center;margin-bottom:22px;">
              <div style="font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:#74d0f1;margin-bottom:10px;">
                Code abonnement
              </div>
              <div style="font-size:30px;line-height:1.2;font-weight:700;color:#ffffff;word-break:break-word;">
                ${code}
              </div>
            </div>

            <div style="border-radius:18px;background:#0f172a;border:1px solid rgba(148,163,184,0.16);padding:18px 20px;">
              <div style="display:flex;justify-content:space-between;gap:14px;padding:8px 0;border-bottom:1px solid rgba(148,163,184,0.12);">
                <span style="font-size:13px;color:#9fb6d8;">Abonnement</span>
                <strong style="font-size:13px;color:#ffffff;text-align:right;">${subscriptionName}</strong>
              </div>
              <div style="display:flex;justify-content:space-between;gap:14px;padding:8px 0;border-bottom:1px solid rgba(148,163,184,0.12);">
                <span style="font-size:13px;color:#9fb6d8;">Prix</span>
                <strong style="font-size:13px;color:#ffffff;text-align:right;">${formatCurrency(sale?.price)}</strong>
              </div>
              <div style="display:flex;justify-content:space-between;gap:14px;padding:8px 0;border-bottom:1px solid rgba(148,163,184,0.12);">
                <span style="font-size:13px;color:#9fb6d8;">Credits inclus</span>
                <strong style="font-size:13px;color:#ffffff;text-align:right;">${totalCredits}</strong>
              </div>
              <div style="display:flex;justify-content:space-between;gap:14px;padding:8px 0;border-bottom:1px solid rgba(148,163,184,0.12);">
                <span style="font-size:13px;color:#9fb6d8;">Credits restants</span>
                <strong style="font-size:13px;color:#ffffff;text-align:right;">${remainingCredits}</strong>
              </div>
              <div style="display:flex;justify-content:space-between;gap:14px;padding:8px 0 0;">
                <span style="font-size:13px;color:#9fb6d8;">Date d'achat</span>
                <strong style="font-size:13px;color:#ffffff;text-align:right;">${formatDateTime(
                  sale?.createdAt,
                )}</strong>
              </div>
            </div>

            <p style="margin:22px 0 0;font-size:12px;line-height:1.6;color:#7f92b2;">
              Conservez cet email. Si vous creez un compte client avec la même adresse email, cet abonnement pourra être rattache automatiquement a votre profil.
            </p>
          </div>
        </div>
      </div>
    </div>
  `;
};

const sendSubscriptionSaleEmail = async ({ saleId }) => {
  if (!isFeatureEnabled()) {
    return { skipped: true, reason: "feature_disabled" };
  }

  if (!saleId) {
    return { skipped: true, reason: "missing_sale_id" };
  }

  const sale = await SubscriptionSale.findById(saleId)
    .populate({
      path: "subscriptionId",
      select: "name price totalCredits expirationDate",
    })
    .populate({ path: "userId", select: "firstName lastName email" })
    .lean();

  if (!sale) {
    const error = new Error("Subscription sale not found");
    error.status = 404;
    throw error;
  }

  const recipient = resolveRecipient(sale);
  const forcedRecipient = normalizeEmail(process.env.SUBSCRIPTIONS_EMAIL_FORCE_TO);
  const recipientEmail = forcedRecipient || recipient.email;

  if (!recipientEmail) {
    return { skipped: true, reason: "missing_recipient" };
  }

  const transporter = getTransporter();
  const smtpUser =
    normalizeEmail(process.env.SMTP_USER) ||
    normalizeEmail(process.env.EMAIL_SMTP_USER) ||
    normalizeEmail(process.env.GMAIL_USER);
  const fromAddress =
    normalizeEmail(process.env.SUBSCRIPTIONS_EMAIL_FROM) ||
    normalizeEmail(process.env.TICKETS_EMAIL_FROM) ||
    smtpUser;

  if (!fromAddress) {
    const error = new Error("Subscription email from address is missing");
    error.status = 500;
    throw error;
  }

  const logoAttachment = getLogoAttachment();
  const html = buildEmailHtml({
    sale,
    subscription: sale.subscriptionId,
    customerName: recipient.fullName,
    hasLogo: Boolean(logoAttachment),
  });

  const attachments = logoAttachment ? [logoAttachment] : [];

  await transporter.sendMail({
    from: fromAddress,
    to: recipientEmail,
    subject: `Votre abonnement ${sale.subscriptionId?.name || "Majestic"} est confirmé`,
    html,
    attachments,
  });

  return {
    recipient: recipientEmail,
    saleId: String(sale._id),
  };
};

const enqueueInternal = (job) => {
  queue.push(job);
  setImmediate(() => {
    void processQueue();
  });
};

const enqueueSubscriptionSaleEmail = ({ saleId }) => {
  if (!saleId) {
    return;
  }
  enqueueInternal({ saleId: String(saleId), attempt: 1 });
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
        await sendSubscriptionSaleEmail({ saleId: job.saleId });
      } catch (error) {
        const maxAttempts = getMaxAttempts();
        if (job.attempt < maxAttempts) {
          const nextAttempt = job.attempt + 1;
          const delay = getRetryDelayMs(job.attempt);
          setTimeout(() => {
            enqueueInternal({ saleId: job.saleId, attempt: nextAttempt });
          }, delay);
        } else {
          console.error(
            `[subscription-email] failed after ${job.attempt} attempts for sale ${job.saleId}`,
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
  enqueueSubscriptionSaleEmail,
  sendSubscriptionSaleEmail,
};
