const express = require("express");

// Identifiants officiels fournis dans le Cahier de Recette ClicToPay
// (CTP-20260514-2969-XY78 / Processing ID 0363062969). Intentionnellement
// séparés de services/paymentService.js et du .env : ce module ne sert qu'à
// exécuter les cas de test CTP-01 à CTP-08 pour remplir le cahier de recette.
const CTP_TEST_CONFIG = {
  userName: "0363062969",
  password: "Ey0m4Q3AfY1p",
  baseUrl: "https://test.clictopay.com/payment/rest",
  currency: "788",
  language: "fr",
};

// Secret partagé attendu dans l'en-tête X-Ctp-Test-Secret. Le proxy Next.js
// (côté serveur, jamais exposé au navigateur) l'ajoute automatiquement.
const CTP_TEST_SECRET = process.env.CTP_TEST_SECRET || "majestic-ctp-recette-2026";

const RETURN_URL = process.env.FRONTEND_URL
  ? `${process.env.FRONTEND_URL}/payment-verify`
  : "http://localhost:3000/payment-verify";

const router = express.Router();

router.use((req, res, next) => {
  if (req.get("X-Ctp-Test-Secret") !== CTP_TEST_SECRET) {
    return res.status(403).json({ message: "Accès refusé." });
  }
  next();
});

async function registerDo(params) {
  const body = new URLSearchParams({
    userName: CTP_TEST_CONFIG.userName,
    password: CTP_TEST_CONFIG.password,
    currency: CTP_TEST_CONFIG.currency,
    language: CTP_TEST_CONFIG.language,
    returnUrl: RETURN_URL,
    failUrl: RETURN_URL,
    ...params,
  });
  const response = await fetch(`${CTP_TEST_CONFIG.baseUrl}/register.do`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const json = await response.json().catch(() => ({}));
  return json;
}

async function getOrderStatusExtended(orderId) {
  const body = new URLSearchParams({
    userName: CTP_TEST_CONFIG.userName,
    password: CTP_TEST_CONFIG.password,
    orderId: String(orderId),
    language: CTP_TEST_CONFIG.language,
  });
  const response = await fetch(`${CTP_TEST_CONFIG.baseUrl}/getOrderStatusExtended.do`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const json = await response.json().catch(() => ({}));
  return json;
}

function uniqueOrderNumber(prefix) {
  return `${prefix}-${Date.now()}`;
}

router.post("/ctp-01", async (req, res) => {
  const orderNumber = uniqueOrderNumber("CTP01");
  const result = await registerDo({ orderNumber, amount: "10000" });
  res.json({ orderNumber, request: "register.do", response: result });
});

router.post("/ctp-02", async (req, res) => {
  const orderNumber = uniqueOrderNumber("CTP02");
  const result = await registerDo({ orderNumber, amount: "10000" });
  res.json({ orderNumber, request: "register.do", response: result });
});

router.post("/ctp-03", async (req, res) => {
  const orderNumber = uniqueOrderNumber("CTP03");
  const result = await registerDo({ orderNumber, amount: "10000" });
  res.json({
    orderNumber,
    request: "register.do",
    response: result,
    card: { number: "4509 2111 1111 1119", expiry: "12/26", cvv: "748" },
  });
});

router.post("/ctp-04", async (req, res) => {
  const orderNumber = uniqueOrderNumber("CTP04");
  const result = await registerDo({ orderNumber, amount: "10000" });
  res.json({
    orderNumber,
    request: "register.do",
    response: result,
    card: { number: "5104 0511 1111 1115", expiry: "12/29", cvv: "749" },
  });
});

router.post("/ctp-05", async (req, res) => {
  const orderNumber = uniqueOrderNumber("CTP05");
  const registerResult = await registerDo({ orderNumber, amount: "10000" });
  if (!registerResult.orderId) {
    return res.json({ orderNumber, request: "register.do", response: registerResult });
  }
  const statusResult = await getOrderStatusExtended(registerResult.orderId);
  res.json({
    orderNumber,
    request: "register.do puis getOrderStatusExtended.do (sans paiement)",
    registerResponse: registerResult,
    statusResponse: statusResult,
  });
});

router.post("/ctp-06", async (req, res) => {
  const orderNumber = uniqueOrderNumber("CTP06");
  const result = await registerDo({ orderNumber }); // amount volontairement omis
  res.json({ orderNumber, request: "register.do (sans amount)", response: result });
});

router.post("/ctp-07", async (req, res) => {
  const orderNumber = uniqueOrderNumber("ORDER-DUP-TEST");
  const first = await registerDo({ orderNumber, amount: "10000" });
  const second = await registerDo({ orderNumber, amount: "10000" });
  res.json({
    orderNumber,
    request: "register.do envoyé deux fois avec le même orderNumber",
    firstResponse: first,
    secondResponse: second,
  });
});

router.post("/ctp-08", async (req, res) => {
  const orderId = "00000000-0000-0000-0000-000000000000";
  const result = await getOrderStatusExtended(orderId);
  res.json({ orderId, request: "getOrderStatusExtended.do", response: result });
});

// Utilisé après un paiement manuel réel sur la page ClicToPay (CTP-02/03/04)
router.post("/check-status", async (req, res) => {
  const { orderId } = req.body;
  if (!orderId) {
    return res.status(400).json({ message: "orderId manquant." });
  }
  const result = await getOrderStatusExtended(orderId);
  res.json({ orderId, request: "getOrderStatusExtended.do", response: result });
});

module.exports = router;
