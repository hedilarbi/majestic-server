const subscriptionSalesService = require("../services/subscriptionSalesService");
const SubscriptionSale = require("../models/SubscriptionSale");

const extractSubscriptionCode = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";

  try {
    const parsed = JSON.parse(raw);
    const nested = parsed?.subscriptionCode || parsed?.code || parsed?.value;
    if (nested) return String(nested).trim().toUpperCase();
  } catch (_error) {
    // The QR usually contains the subscription code directly.
  }

  try {
    const url = new URL(raw);
    const queryCode =
      url.searchParams.get("subscriptionCode") || url.searchParams.get("code");
    if (queryCode) return queryCode.trim().toUpperCase();
  } catch (_error) {
    // Not a URL.
  }

  const match = raw.toUpperCase().match(/AB-[A-Z0-9-]+/);
  return (match?.[0] || raw).replace(/\s+/g, "").toUpperCase();
};

const getSubscriptionScanChannel = async (req, res) => {
  if (req.user?.role !== "ticket_office") {
    return res.status(403).json({ message: "Accès guichet requis" });
  }

  return res.status(200).json({
    channel: `guichet-${req.user.sub}`,
  });
};

const scanSubscriptionSale = async (req, res) => {
  try {
    if (req.user?.role !== "ticket_office") {
      return res.status(403).json({ message: "Accès guichet requis" });
    }

    const subscriptionCode = extractSubscriptionCode(
      req.body?.qrText || req.body?.subscriptionCode,
    );
    if (!subscriptionCode) {
      return res.status(400).json({ message: "QR abonnement invalide." });
    }

    const sale = await SubscriptionSale.findOne({ subscriptionCode })
      .populate(
        "subscriptionId",
        "name allowedSeatType maxSeatsPerSession expirationDate isActive",
      )
      .populate("userId", "firstName lastName email")
      .lean();

    if (!sale) {
      return res.status(404).json({ message: "Abonnement introuvable." });
    }

    const now = new Date();
    const expiresAt = sale.expiresAt || sale.subscriptionId?.expirationDate || null;
    let invalidReason = "";
    if (sale.status !== "confirmed" || sale.paymentStatus !== "completed") {
      invalidReason = "Cet abonnement n'est pas confirmé.";
    } else if (sale.subscriptionId?.isActive === false) {
      invalidReason = "Cette offre d'abonnement est désactivée.";
    } else if (expiresAt && new Date(expiresAt) < now) {
      invalidReason = "Cet abonnement est expiré.";
    } else if (Number(sale.remainingCredits || 0) <= 0) {
      invalidReason = "Cet abonnement ne possède plus de crédits.";
    }

    const result = {
      subscriptionSaleId: String(sale._id),
      subscriptionCode: sale.subscriptionCode,
      subscriptionName: sale.subscriptionId?.name || "Abonnement Majestic",
      customerName: [
        sale.customerContact?.firstName || sale.userId?.firstName,
        sale.customerContact?.lastName || sale.userId?.lastName,
      ]
        .filter(Boolean)
        .join(" ") || sale.customerContact?.email || sale.userId?.email || "",
      remainingCredits: Number(sale.remainingCredits || 0),
      expiresAt,
      allowedSeatType:
        sale.subscriptionId?.allowedSeatType || sale.allowedSeatType || "normale",
      maxSeatsPerSession:
        sale.subscriptionId?.maxSeatsPerSession || sale.maxSeatsPerSession || 1,
      isValid: !invalidReason,
      invalidReason,
      scannedAt: now.toISOString(),
    };

    req.io
      ?.to(`guichet-${req.user.sub}`)
      .emit("subscription-scanned", result);

    return res.status(200).json(result);
  } catch (error) {
    return res
      .status(error.status || 500)
      .json({ message: error.message || "Impossible de lire l'abonnement." });
  }
};
const {
  formatCurrency,
  formatDateTime,
  sendTabularExport,
} = require("../services/exportService");
const {
  hasDashboardPermission,
  isDashboardStaffRole,
} = require("../config/dashboardPermissions");

const formatIdentity = (value) => {
  if (!value || typeof value !== "object") {
    return "";
  }

  return `${value.firstName || ""} ${value.lastName || ""}`.trim() || value.email || "";
};

const formatCustomer = (sale) =>
  formatIdentity(sale.user) || formatIdentity(sale.customerContact) || "";

const listSubscriptionSales = async (req, res) => {
  try {
    if (!hasDashboardPermission(req.user, "sales_subscriptions", "list")) {
      return res.status(403).json({ message: "Permission insuffisante" });
    }

    const result = await subscriptionSalesService.listSubscriptionSales({
      page: req.query.page,
      limit: req.query.limit,
      dateFrom: req.query.dateFrom || req.query.from,
      dateTo: req.query.dateTo || req.query.to,
      paymentMethod: req.query.paymentMethod,
      paymentStatus: req.query.paymentStatus,
      status: req.query.status,
      source: req.query.source,
    });

    return res.status(200).json(result);
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
  }
};

const exportSubscriptionSales = async (req, res) => {
  try {
    if (!hasDashboardPermission(req.user, "sales_subscriptions", "list")) {
      return res.status(403).json({ message: "Permission insuffisante" });
    }

    const items = await subscriptionSalesService.listSubscriptionSalesForExport({
      dateFrom: req.query.dateFrom || req.query.from,
      dateTo: req.query.dateTo || req.query.to,
      paymentMethod: req.query.paymentMethod,
      paymentStatus: req.query.paymentStatus,
      status: req.query.status,
      source: req.query.source,
    });

    await sendTabularExport({
      res,
      format: req.params.format,
      baseFilename: "abonnements-vendus",
      title: "Abonnements vendus",
      filters: [
        { label: "Date début", value: req.query.dateFrom || req.query.from },
        { label: "Date fin", value: req.query.dateTo || req.query.to },
        { label: "Paiement", value: req.query.paymentMethod },
        { label: "Statut paiement", value: req.query.paymentStatus },
        { label: "Statut", value: req.query.status },
        { label: "Source", value: req.query.source },
      ],
      columns: [
        { key: "customer", label: "Client", value: formatCustomer },
        {
          key: "subscriptionCode",
          label: "Code abonnement",
          value: (item) => item.subscriptionCode || "",
        },
        {
          key: "subscription",
          label: "Abonnement",
          value: (item) => item.subscription?.name || "",
        },
        {
          key: "price",
          label: "Prix",
          value: (item) => formatCurrency(item.price),
        },
        {
          key: "totalCredits",
          label: "Crédits",
          value: (item) => item.totalCredits ?? item.subscription?.totalCredits ?? "",
        },
        {
          key: "remainingCredits",
          label: "Restants",
          value: (item) => item.remainingCredits ?? "",
        },
        {
          key: "paymentMethod",
          label: "Paiement",
          value: (item) => item.paymentMethod || "",
        },
        {
          key: "paymentStatus",
          label: "Statut paiement",
          value: (item) => item.paymentStatus || "",
        },
        { key: "status", label: "Statut", value: (item) => item.status || "" },
        { key: "source", label: "Source", value: (item) => item.source || "" },
        { key: "soldBy", label: "Vendeur", value: (item) => formatIdentity(item.soldBy) },
        {
          key: "createdAt",
          label: "Date",
          value: (item) => formatDateTime(item.createdAt),
        },
      ],
      rows: items,
    });
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
  }
};

const listMySubscriptionSales = async (req, res) => {
  try {
    const role = req.user && req.user.role;
    if (
      role !== "ticket_office" &&
      !(
        isDashboardStaffRole(role) &&
        hasDashboardPermission(req.user, "sales_subscriptions", "list")
      )
    ) {
      return res.status(403).json({ message: "Accès guichet requis" });
    }

    const result = await subscriptionSalesService.listSubscriptionSalesForUser({
      userId: req.user && req.user.sub,
      page: req.query.page,
      limit: req.query.limit,
      dateFrom: req.query.dateFrom || req.query.from,
      dateTo: req.query.dateTo || req.query.to,
    });

    return res.status(200).json(result);
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
  }
};

const createSubscriptionSale = async (req, res) => {
  try {
    const role = req.user && req.user.role;
    if (
      role !== "ticket_office" &&
      role !== "customer" &&
      !isDashboardStaffRole(role)
    ) {
      return res.status(403).json({ message: "Accès refuse" });
    }

    const result = await subscriptionSalesService.createSubscriptionSale({
      payload: req.body || {},
      userId: req.user && req.user.sub,
      userRole: role,
    });

    return res.status(201).json(result);
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
  }
};

module.exports = {
  listSubscriptionSales,
  exportSubscriptionSales,
  listMySubscriptionSales,
  createSubscriptionSale,
  getSubscriptionScanChannel,
  scanSubscriptionSale,
};
