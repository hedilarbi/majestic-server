const fs = require("fs");
const path = require("path");

const EmailVerification = require("../models/EmailVerification");

let cachedTransporter = null;
let cachedNodemailer = null;
let cachedLogoAttachment = undefined;

const queue = [];
let queueProcessing = false;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LOGO_CID = "majestic-logo";

const PURPOSE_COPY = {
  email_verification: {
    subject: "Votre code OTP d'inscription Majestic",
    title: "Confirmez votre inscription",
    intro:
      "Utilisez ce code OTP pour vérifier votre adresse email et finaliser la création de votre compte.",
    helper:
      "Si vous n'etes pas a l'origine de cette inscription, vous pouvez ignorer cet email.",
  },
  password_reset: {
    subject: "Votre code OTP de réinitialisation Majestic",
    title: "Réinitialisez votre mot de passe",
    intro:
      "Utilisez ce code OTP pour confirmer votre demande de réinitialisation de mot de passe.",
    helper:
      "Si vous n'avez pas demande de réinitialisation, vous pouvez ignorer cet email.",
  },
};

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
    String(process.env.OTP_EMAIL_ENABLED || "true").trim().toLowerCase(),
  );

const getMaxAttempts = () => toPositiveInt(process.env.OTP_EMAIL_MAX_ATTEMPTS, 3);

const getRetryDelayMs = (attempt) => {
  const baseDelay = toPositiveInt(process.env.OTP_EMAIL_RETRY_DELAY_MS, 8000);
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

  const envLogoPath = normalizeText(process.env.OTP_EMAIL_LOGO_PATH);
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

const resolvePurposeCopy = (purpose) =>
  PURPOSE_COPY[purpose] || PURPOSE_COPY.email_verification;

const buildEmailHtml = ({ verification, hasLogo }) => {
  const copy = resolvePurposeCopy(verification?.purpose);
  const otp = normalizeText(verification?.otp) || "------";
  const expiresAt = formatDateTime(verification?.expiresAt);
  const email = normalizeText(verification?.email);

  return `
    <!doctype html>
    <html lang="fr">
      <head>
        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${copy.title}</title>
      </head>
      <body style="margin:0;padding:0;background:#f3f7fb;font-family:Arial,sans-serif;color:#0f172a;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f3f7fb;margin:0;padding:0;">
          <tr>
            <td align="center" style="padding:32px 20px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:680px;background:#ffffff;border:1px solid #d7e3f2;border-radius:24px;overflow:hidden;">
                <tr>
                  <td style="padding:28px 32px;background:#1034a6;background-image:linear-gradient(135deg,#74d0f1 0%,#1034a6 100%);">
                    ${
                      hasLogo
                        ? `<img src="cid:${LOGO_CID}" alt="Majestic" style="height:54px;width:auto;display:block;margin:0 0 18px 0;border:0;outline:none;text-decoration:none;" />`
                        : ""
                    }
                    <div style="font-size:28px;line-height:1.15;font-weight:700;color:#ffffff;">
                      ${copy.title}
                    </div>
                    <div style="margin-top:8px;font-size:14px;line-height:1.6;color:#f8fbff;">
                      ${copy.intro}
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:28px 32px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:22px;border:1px solid #d6e5f7;border-radius:18px;background:#f8fbff;">
                      <tr>
                        <td align="center" style="padding:22px 20px;">
                          <div style="font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:#2b5fd9;margin-bottom:10px;">
                            Code OTP
                          </div>
                          <div style="font-size:38px;line-height:1.2;font-weight:700;color:#0f172a;letter-spacing:0.2em;">
                            ${otp}
                          </div>
                        </td>
                      </tr>
                    </table>

                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border:1px solid #e2e8f0;border-radius:18px;background:#ffffff;">
                      <tr>
                        <td style="padding:12px 20px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#64748b;">
                          Email
                        </td>
                        <td align="right" style="padding:12px 20px;border-bottom:1px solid #e2e8f0;font-size:13px;font-weight:700;color:#0f172a;">
                          ${email}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:12px 20px;font-size:13px;color:#64748b;">
                          Expire le
                        </td>
                        <td align="right" style="padding:12px 20px;font-size:13px;font-weight:700;color:#0f172a;">
                          ${expiresAt || "Bientôt"}
                        </td>
                      </tr>
                    </table>

                    <p style="margin:22px 0 0;font-size:13px;line-height:1.7;color:#475569;">
                      ${copy.helper}
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
};

const buildEmailText = ({ verification }) => {
  const copy = resolvePurposeCopy(verification?.purpose);
  const otp = normalizeText(verification?.otp) || "------";
  const expiresAt = formatDateTime(verification?.expiresAt) || "Bientôt";
  const email = normalizeText(verification?.email);

  return [
    copy.title,
    "",
    copy.intro,
    "",
    `Code OTP : ${otp}`,
    `Email : ${email}`,
    `Expire le : ${expiresAt}`,
    "",
    copy.helper,
  ].join("\n");
};

const sendCustomerOtpEmail = async ({ verificationId }) => {
  if (!isFeatureEnabled()) {
    return { skipped: true, reason: "feature_disabled" };
  }

  if (!verificationId) {
    return { skipped: true, reason: "missing_verification_id" };
  }

  const verification = await EmailVerification.findById(verificationId).lean();
  if (!verification) {
    return { skipped: true, reason: "missing_verification" };
  }

  const forcedRecipient = normalizeEmail(process.env.OTP_EMAIL_FORCE_TO);
  const recipientEmail = forcedRecipient || normalizeEmail(verification.email);
  if (!recipientEmail) {
    return { skipped: true, reason: "missing_recipient" };
  }

  const transporter = getTransporter();
  const smtpUser =
    normalizeEmail(process.env.SMTP_USER) ||
    normalizeEmail(process.env.EMAIL_SMTP_USER) ||
    normalizeEmail(process.env.GMAIL_USER);
  const fromAddress =
    normalizeEmail(process.env.OTP_EMAIL_FROM) ||
    normalizeEmail(process.env.TICKETS_EMAIL_FROM) ||
    smtpUser;

  if (!fromAddress) {
    const error = new Error("OTP email from address is missing");
    error.status = 500;
    throw error;
  }

  const copy = resolvePurposeCopy(verification.purpose);
  const logoAttachment = getLogoAttachment();
  const attachments = logoAttachment ? [logoAttachment] : [];
  const html = buildEmailHtml({
    verification,
    hasLogo: Boolean(logoAttachment),
  });
  const text = buildEmailText({ verification });

  await transporter.sendMail({
    from: fromAddress,
    to: recipientEmail,
    subject: copy.subject,
    text,
    html,
    attachments,
  });

  return {
    recipient: recipientEmail,
    verificationId: String(verification._id),
  };
};

const enqueueInternal = (job) => {
  queue.push(job);
  setImmediate(() => {
    void processQueue();
  });
};

const enqueueCustomerOtpEmail = ({ verificationId }) => {
  if (!verificationId) {
    return;
  }

  enqueueInternal({ verificationId: String(verificationId), attempt: 1 });
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
        await sendCustomerOtpEmail({ verificationId: job.verificationId });
      } catch (error) {
        const maxAttempts = getMaxAttempts();
        if (job.attempt < maxAttempts) {
          const nextAttempt = job.attempt + 1;
          const delay = getRetryDelayMs(job.attempt);
          setTimeout(() => {
            enqueueInternal({
              verificationId: job.verificationId,
              attempt: nextAttempt,
            });
          }, delay);
        } else {
          console.error(
            `[customer-otp-email] failed after ${job.attempt} attempts for verification ${job.verificationId}`,
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
  enqueueCustomerOtpEmail,
  sendCustomerOtpEmail,
};
