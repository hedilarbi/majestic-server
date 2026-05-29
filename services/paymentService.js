const crypto = require("crypto");

// Désactiver la vérification SSL stricte pour l'environnement de test IPAY
// (Leur certificat test.clictopay.com provoque une erreur UNABLE_TO_VERIFY_LEAF_SIGNATURE)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

// Configuration IPAY
const IPAY_CONFIG = {
  // En production, ces valeurs devraient venir des variables d'environnement (process.env.IPAY_API_USER, etc.)
  userName: process.env.IPAY_API_USER || "0340296516",
  password: process.env.IPAY_API_PASSWORD || "9upjghsP7",
  baseUrl: process.env.IPAY_BASE_URL || "https://test.clictopay.com/payment/rest",
  currency: "788", // TND
  language: "fr",
};

/**
 * Enregistre un paiement auprès de ClicToPay.
 * Retourne le formUrl pour rediriger le client.
 */
const registerPayment = async ({
  amount, // montant exact (ex: si 10.50 TND, doit être 10500 en millimes, donc montant * 1000)
  orderNumber, // identifiant de la commande côté marchand
  returnUrl,
  failUrl,
}) => {
  try {
    // Le montant fourni à ClicToPay doit être l'unité minimale (pour TND, c'est le millime).
    // Si la base de données stocke le montant en TND (ex: 10.5), on le multiplie par 1000.
    const amountInMinorUnits = Math.round(Number(amount) * 1000);

    const params = new URLSearchParams({
      userName: IPAY_CONFIG.userName,
      password: IPAY_CONFIG.password,
      orderNumber: String(orderNumber),
      amount: String(amountInMinorUnits),
      currency: IPAY_CONFIG.currency,
      returnUrl: returnUrl,
      failUrl: failUrl || returnUrl, // fallback
      language: IPAY_CONFIG.language,
    });

    const url = `${IPAY_CONFIG.baseUrl}/register.do`;
    
    // Si Node < 18 sans fetch, on peut utiliser import("node-fetch") ou la librairie axios.
    // Majestic Server a l'air moderne, donc on utilise le fetch natif.
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    const data = await response.json();

    if (data.errorCode && data.errorCode !== "0" && data.errorCode !== 0) {
      throw new Error(`Erreur IPAY [${data.errorCode}]: ${data.errorMessage}`);
    }

    return {
      orderId: data.orderId, // ID unique de la transaction IPAY
      formUrl: data.formUrl, // L'URL de la page de paiement
    };
  } catch (error) {
    console.error("[paymentService] registerPayment error:", error);
    throw new Error("Impossible d'initialiser le paiement en ligne.");
  }
};

/**
 * Vérifie le statut d'un paiement après retour du client.
 */
const verifyPayment = async ({ orderId }) => {
  try {
    const params = new URLSearchParams({
      userName: IPAY_CONFIG.userName,
      password: IPAY_CONFIG.password,
      orderId: String(orderId),
      language: IPAY_CONFIG.language,
    });

    const url = `${IPAY_CONFIG.baseUrl}/getOrderStatusExtended.do`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    const data = await response.json();
    
    console.log("[paymentService] verifyPayment raw response:", JSON.stringify(data, null, 2));

    // orderStatus = 2 → approuvé (production)
    // orderStatus = 1 → pré-autorisé (certains environnements test)
    const isSuccess = data.orderStatus === 2 || data.orderStatus === 1;
    
    return {
      orderStatus: data.orderStatus,
      isSuccess,
      actionCodeDescription: data.actionCodeDescription,
      amount: data.amount ? Number(data.amount) / 1000 : 0,
      currency: data.currency,
      orderNumber: data.orderNumber,
    };
  } catch (error) {
    console.error("[paymentService] verifyPayment error:", error);
    throw new Error("Impossible de vérifier le statut du paiement.");
  }
};

module.exports = {
  registerPayment,
  verifyPayment,
};
