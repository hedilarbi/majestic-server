const nodemailer = require("nodemailer");

// One SMTP mailbox per kind of email. Each mailbox authenticates with its own
// credentials and is also the "From" address, so the mail server accepts it.
const MAIL_ACCOUNTS = {
  // Tickets and subscription confirmations
  tickets: {
    userEnv: "TICKETS_EMAIL_USER",
    passEnv: "TICKETS_EMAIL_PASS",
    nameEnv: "TICKETS_EMAIL_FROM_NAME",
    defaultName: "Le Majestic - Billetterie",
  },
  // Verification codes (OTP): sign-up and forgotten password
  noreply: {
    userEnv: "NOREPLY_EMAIL_USER",
    passEnv: "NOREPLY_EMAIL_PASS",
    nameEnv: "NOREPLY_EMAIL_FROM_NAME",
    defaultName: "Le Majestic",
  },
  // Replies to space reservation requests and other contact messages
  contact: {
    userEnv: "CONTACT_EMAIL_USER",
    passEnv: "CONTACT_EMAIL_PASS",
    nameEnv: "CONTACT_EMAIL_FROM_NAME",
    defaultName: "Le Majestic - Contact",
  },
};

const transportsByAccount = new Map();

const readEnv = (name) => String(process.env[name] || "").trim();

const configError = (message) => {
  const error = new Error(message);
  error.status = 500;
  error.code = "SMTP_CONFIG_MISSING";
  return error;
};

const resolveAccount = (account) => {
  const config = MAIL_ACCOUNTS[account];
  if (!config) {
    throw configError(`Unknown mail account "${account}".`);
  }

  const user = readEnv(config.userEnv);
  const pass = readEnv(config.passEnv);
  if (!user || !pass) {
    throw configError(
      `SMTP credentials missing. Set ${config.userEnv} and ${config.passEnv}.`,
    );
  }

  return { config, user, pass };
};

const getMailTransport = (account) => {
  if (transportsByAccount.has(account)) {
    return transportsByAccount.get(account);
  }

  const { user, pass } = resolveAccount(account);
  const host = readEnv("SMTP_HOST");
  if (!host) {
    throw configError("SMTP_HOST is missing.");
  }

  const port = Number.parseInt(readEnv("SMTP_PORT"), 10) || 465;
  const secureFlag = readEnv("SMTP_SECURE").toLowerCase();
  const secure = secureFlag ? secureFlag === "true" : port === 465;

  const transport = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });

  transportsByAccount.set(account, transport);
  return transport;
};

// `"Le Majestic - Billetterie" <billets@...>`
const getMailFrom = (account) => {
  const { config, user } = resolveAccount(account);
  const name = readEnv(config.nameEnv) || config.defaultName;
  return `"${name.replace(/"/g, "")}" <${user}>`;
};

module.exports = {
  getMailTransport,
  getMailFrom,
};
