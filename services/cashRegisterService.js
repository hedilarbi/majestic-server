const mongoose = require("mongoose");

const Booking = require("../models/Booking");
const CashRegisterClosure = require("../models/CashRegisterClosure");
const CashierRegisterClosure = require("../models/CashierRegisterClosure");
const SubscriptionSale = require("../models/SubscriptionSale");
const Ticket = require("../models/Ticket");
const User = require("../models/User");

const TICKET_OFFICE_ROLE = "ticket_office";
const CASHIER_ROLE = "cashier";
const SUPERVISOR_ROLES = new Set(["super_admin", "admin"]);
const ACTIVE_BOOKING_STATUSES = ["confirmed", "used"];
const ACTIVE_SUBSCRIPTION_SALE_STATUSES = ["confirmed"];
const COMPLETED_SUBSCRIPTION_PAYMENT_STATUS = "completed";
const PERIOD_ORIGIN = new Date(0);

const toValidDate = (value) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const parseFilterDate = (value, label, boundary = "start") => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      const error = new Error(`${label} invalide`);
      error.status = 400;
      throw error;
    }

    return value;
  }

  if (typeof value !== "string") {
    const error = new Error(`${label} invalide`);
    error.status = 400;
    throw error;
  }

  const normalizedValue = value.trim();
  if (!normalizedValue) {
    return null;
  }

  const dateOnlyMatch = normalizedValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    return boundary === "end"
      ? new Date(Number(year), Number(month) - 1, Number(day), 23, 59, 59, 999)
      : new Date(Number(year), Number(month) - 1, Number(day), 0, 0, 0, 0);
  }

  const parsed = new Date(normalizedValue);
  if (Number.isNaN(parsed.getTime())) {
    const error = new Error(`${label} invalide`);
    error.status = 400;
    throw error;
  }

  return parsed;
};

const buildClosedAtFilter = ({ dateFrom, dateTo } = {}) => {
  const fromDate = parseFilterDate(dateFrom, "dateFrom", "start");
  const toDate = parseFilterDate(dateTo, "dateTo", "end");

  if (!fromDate && !toDate) {
    return null;
  }

  if (fromDate && toDate && fromDate.getTime() > toDate.getTime()) {
    const error = new Error("dateFrom must be before dateTo");
    error.status = 400;
    throw error;
  }

  return {
    ...(fromDate ? { $gte: fromDate } : {}),
    ...(toDate ? { $lte: toDate } : {}),
  };
};

const startOfBusinessDay = (value) => {
  const date = toValidDate(value) || new Date();
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
};

const addBusinessDays = (value, days) => {
  const date = startOfBusinessDay(value);
  date.setDate(date.getDate() + days);
  return date;
};

const getTimestamp = (value) => {
  const date = toValidDate(value);
  return date ? date.getTime() : 0;
};

const ensureValidObjectId = (value, label) => {
  if (!mongoose.isValidObjectId(value)) {
    const error = new Error(`${label} invalide`);
    error.status = 400;
    throw error;
  }
};

const buildStaffSnapshot = (user) => ({
  firstName: user?.firstName || "",
  lastName: user?.lastName || "",
  email: user?.email || "",
});

const serializeStaff = (user) => ({
  id: user?._id ? user._id.toString() : "",
  firstName: user?.firstName || "",
  lastName: user?.lastName || "",
  fullName: [user?.firstName || "", user?.lastName || ""].join(" ").trim(),
  email: user?.email || "",
  status: user?.status || "active",
  role: user?.role || "",
});

const serializeCustomerContact = (contact) => {
  if (!contact || typeof contact !== "object") {
    return null;
  }

  const firstName = typeof contact.firstName === "string" ? contact.firstName.trim() : "";
  const lastName = typeof contact.lastName === "string" ? contact.lastName.trim() : "";
  const email = typeof contact.email === "string" ? contact.email.trim().toLowerCase() : "";

  if (!firstName && !lastName && !email) {
    return null;
  }

  return {
    firstName,
    lastName,
    email,
  };
};

const serializePromotion = (promotion) => {
  if (!promotion || typeof promotion !== "object") {
    return null;
  }

  const normalizedCode =
    typeof promotion.code === "string"
      ? promotion.code.trim().toUpperCase()
      : "";
  const normalizedType = ["amount", "percent"].includes(promotion.reductionType)
    ? promotion.reductionType
    : undefined;
  const reductionValue = Number(promotion.reductionValue);
  const discountAmount = Number(promotion.discountAmount);
  const safeReductionValue = Number.isFinite(reductionValue)
    ? reductionValue
    : undefined;
  const safeDiscountAmount = Number.isFinite(discountAmount)
    ? discountAmount
    : undefined;

  if (
    !normalizedCode &&
    !normalizedType &&
    safeReductionValue === undefined &&
    safeDiscountAmount === undefined
  ) {
    return null;
  }

  return {
    ...(normalizedCode ? { code: normalizedCode } : {}),
    ...(normalizedType ? { reductionType: normalizedType } : {}),
    ...(safeReductionValue !== undefined
      ? { reductionValue: safeReductionValue }
      : {}),
    ...(safeDiscountAmount !== undefined
      ? { discountAmount: safeDiscountAmount }
      : {}),
  };
};

const serializeTariffBreakdown = (items = []) =>
  items.map((item) => ({
    pricingName: item.pricingName || "",
    price: Number.isFinite(Number(item.price)) ? Number(item.price) : 0,
    quantity: Number.isFinite(Number(item.quantity)) ? Number(item.quantity) : 0,
  }));

const roundAmount = (value) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return 0;
  }

  return Math.round(numericValue * 100) / 100;
};

const toCents = (value) => Math.max(Math.round(roundAmount(value) * 100), 0);

const fromCents = (value) => roundAmount(Number(value) / 100);

const buildReductionValueLabel = (promotion) => {
  if (!promotion || typeof promotion !== "object") {
    return "";
  }

  const type = ["amount", "percent"].includes(promotion.reductionType)
    ? promotion.reductionType
    : "";
  const value = Number(promotion.reductionValue);

  if (!type || !Number.isFinite(value)) {
    return "";
  }

  if (type === "percent") {
    return `${value}%`;
  }

  return `${roundAmount(value).toFixed(2)} DT`;
};

const distributeFinalTicketAmounts = ({ tickets = [], bookingTotalAmount, usedSubscription }) => {
  if (!Array.isArray(tickets) || tickets.length === 0) {
    return [];
  }

  if (usedSubscription) {
    return tickets.map((ticket) => {
      const basePrice = roundAmount(ticket?.price);
      return {
        ...ticket,
        basePrice,
        finalPrice: 0,
        reductionAmount: basePrice,
      };
    });
  }

  const basePriceCents = tickets.map((ticket) => toCents(ticket?.price));
  const totalBaseCents = basePriceCents.reduce((sum, current) => sum + current, 0);
  const targetCents = Math.min(toCents(bookingTotalAmount), totalBaseCents);

  if (totalBaseCents <= 0) {
    return tickets.map((ticket) => ({
      ...ticket,
      basePrice: 0,
      finalPrice: 0,
      reductionAmount: 0,
    }));
  }

  let assignedCents = 0;

  return tickets.map((ticket, index) => {
    const baseCents = basePriceCents[index];
    const finalCents =
      index === tickets.length - 1
        ? Math.max(targetCents - assignedCents, 0)
        : Math.min(
            Math.round((targetCents * baseCents) / totalBaseCents),
            baseCents,
          );

    assignedCents += finalCents;

    const basePrice = fromCents(baseCents);
    const finalPrice = fromCents(finalCents);

    return {
      ...ticket,
      basePrice,
      finalPrice,
      reductionAmount: roundAmount(basePrice - finalPrice),
    };
  });
};

const buildFallbackTicketsFromBreakdown = (transaction) => {
  const tariffBreakdown = Array.isArray(transaction?.tariffBreakdown)
    ? transaction.tariffBreakdown
    : [];
  const items = [];

  tariffBreakdown.forEach((entry) => {
    const quantity = Number.isFinite(Number(entry?.quantity))
      ? Number(entry.quantity)
      : 0;

    for (let index = 0; index < quantity; index += 1) {
      items.push({
        id: "",
        code: "",
        seat: { row: "", col: null },
        pricingName: entry?.pricingName || "",
        price: roundAmount(entry?.price),
      });
    }
  });

  return items;
};

const serializeTransactionSummary = (item) => ({
  bookingId: item?.bookingId ? item.bookingId.toString() : "",
  bookingNumber: item?.bookingNumber || "",
  createdAt: item?.createdAt || null,
  totalAmount: Number.isFinite(Number(item?.totalAmount))
    ? Number(item.totalAmount)
    : 0,
  paymentMethod: item?.paymentMethod || "",
  ticketCount: Number.isFinite(Number(item?.ticketCount))
    ? Number(item.ticketCount)
    : 0,
  usedSubscription: item?.usedSubscription === true,
  promotion: serializePromotion(item?.promotion),
  tariffBreakdown: serializeTariffBreakdown(item?.tariffBreakdown),
  session: item?.session
    ? {
        eventName: item.session.eventName || "",
        date: item.session.date || null,
        sessionTime: item.session.sessionTime || "",
      }
    : null,
});

const serializeSubscriptionSaleSummary = (item) => ({
  subscriptionSaleId: item?.subscriptionSaleId
    ? item.subscriptionSaleId.toString()
    : item?._id
      ? item._id.toString()
      : "",
  subscriptionCode: item?.subscriptionCode || "",
  createdAt: item?.createdAt || null,
  totalAmount: Number.isFinite(Number(item?.totalAmount ?? item?.price))
    ? Number(item.totalAmount ?? item.price)
    : 0,
  paymentMethod: item?.paymentMethod || "",
  subscriptionName: item?.subscriptionName || item?.subscriptionId?.name || "",
  totalCredits: Number.isFinite(Number(item?.totalCredits ?? item?.subscriptionId?.totalCredits))
    ? Number(item.totalCredits ?? item.subscriptionId.totalCredits)
    : 0,
  customerContact: serializeCustomerContact(item?.customerContact),
});

const getMostRecentDate = (...values) => {
  const timestamps = values
    .map((value) => new Date(value || 0).getTime())
    .filter((value) => Number.isFinite(value) && value > 0);

  if (timestamps.length === 0) {
    return null;
  }

  return new Date(Math.max(...timestamps));
};

const serializeClosure = (closure) => ({
  id: closure?._id ? closure._id.toString() : "",
  ticketOffice: {
    id: closure?.ticketOfficeId
      ? closure.ticketOfficeId.toString()
      : "",
    ...buildStaffSnapshot(closure?.ticketOfficeSnapshot),
  },
  cashier: {
    id: closure?.cashierId ? closure.cashierId.toString() : "",
    ...buildStaffSnapshot(closure?.cashierSnapshot),
  },
  periodStartAt: closure?.periodStartAt || null,
  periodEndAt: closure?.periodEndAt || null,
  closedAt: closure?.closedAt || null,
  amount: Number.isFinite(Number(closure?.amount)) ? Number(closure.amount) : 0,
  bookingCount: Number.isFinite(Number(closure?.bookingCount))
    ? Number(closure.bookingCount)
    : 0,
  ticketCount: Number.isFinite(Number(closure?.ticketCount))
    ? Number(closure.ticketCount)
    : 0,
  subscriptionSaleCount: Number.isFinite(Number(closure?.subscriptionSaleCount))
    ? Number(closure.subscriptionSaleCount)
    : 0,
  transactions: Array.isArray(closure?.transactions)
    ? closure.transactions.map(serializeTransactionSummary)
    : [],
  subscriptionSales: Array.isArray(closure?.subscriptionSales)
    ? closure.subscriptionSales.map(serializeSubscriptionSaleSummary)
    : [],
});

const serializeCashierTransfer = (transfer) => ({
  id: transfer?.cashRegisterClosureId
    ? transfer.cashRegisterClosureId.toString()
    : transfer?._id
      ? transfer._id.toString()
      : "",
  ticketOffice: {
    id: transfer?.ticketOfficeId ? transfer.ticketOfficeId.toString() : "",
    ...buildStaffSnapshot(transfer?.ticketOfficeSnapshot),
  },
  periodStartAt: transfer?.periodStartAt || null,
  periodEndAt: transfer?.periodEndAt || null,
  closedAt: transfer?.closedAt || null,
  amount: Number.isFinite(Number(transfer?.amount)) ? Number(transfer.amount) : 0,
  bookingCount: Number.isFinite(Number(transfer?.bookingCount))
    ? Number(transfer.bookingCount)
    : 0,
  ticketCount: Number.isFinite(Number(transfer?.ticketCount))
    ? Number(transfer.ticketCount)
    : 0,
  subscriptionSaleCount: Number.isFinite(Number(transfer?.subscriptionSaleCount))
    ? Number(transfer.subscriptionSaleCount)
    : 0,
});

const serializeCashierClosure = (closure) => ({
  id: closure?._id ? closure._id.toString() : "",
  cashier: {
    id: closure?.cashierId ? closure.cashierId.toString() : "",
    ...buildStaffSnapshot(closure?.cashierSnapshot),
  },
  closedBy: {
    id: closure?.closedById ? closure.closedById.toString() : "",
    ...buildStaffSnapshot(closure?.closedBySnapshot),
  },
  periodStartAt: closure?.periodStartAt || null,
  periodEndAt: closure?.periodEndAt || null,
  closedAt: closure?.closedAt || null,
  amount: Number.isFinite(Number(closure?.amount)) ? Number(closure.amount) : 0,
  transferCount: Number.isFinite(Number(closure?.transferCount))
    ? Number(closure.transferCount)
    : 0,
  bookingCount: Number.isFinite(Number(closure?.bookingCount))
    ? Number(closure.bookingCount)
    : 0,
  ticketCount: Number.isFinite(Number(closure?.ticketCount))
    ? Number(closure.ticketCount)
    : 0,
  subscriptionSaleCount: Number.isFinite(Number(closure?.subscriptionSaleCount))
    ? Number(closure.subscriptionSaleCount)
    : 0,
  transfers: Array.isArray(closure?.transfers)
    ? closure.transfers.map(serializeCashierTransfer)
    : [],
});

const getUserById = async (userId, label) => {
  ensureValidObjectId(userId, label);

  const user = await User.findById(userId)
    .select("_id firstName lastName email role status")
    .lean();

  if (!user) {
    const error = new Error(`${label} introuvable`);
    error.status = 404;
    throw error;
  }

  return user;
};

const getTicketOfficeUser = async (ticketOfficeId) => {
  const ticketOffice = await getUserById(ticketOfficeId, "Guichet");

  if (ticketOffice.role !== TICKET_OFFICE_ROLE) {
    const error = new Error("Le staff cible n'est pas un guichet");
    error.status = 400;
    throw error;
  }

  return ticketOffice;
};

const getCashierUser = async (cashierId) => {
  const cashier = await getUserById(cashierId, "Caissier");

  if (cashier.role !== CASHIER_ROLE) {
    const error = new Error("Accès caissier requis");
    error.status = 403;
    throw error;
  }

  return cashier;
};

const getSupervisorUser = async (supervisorId) => {
  const supervisor = await getUserById(supervisorId, "Superviseur");

  if (!SUPERVISOR_ROLES.has(supervisor.role)) {
    const error = new Error("Accès administrateur requis");
    error.status = 403;
    throw error;
  }

  return supervisor;
};

const getLastClosureForTicketOffice = async (ticketOfficeId) =>
  CashRegisterClosure.findOne({ ticketOfficeId })
    .sort({ periodEndAt: -1, createdAt: -1 })
    .lean();

const getLastCashierClosure = async (cashierId) =>
  CashierRegisterClosure.findOne({ cashierId })
    .sort({ periodEndAt: -1, createdAt: -1 })
    .lean();

const buildSalesPeriodFilter = ({ periodStartAt, periodEndAt }) => ({
  ...(periodStartAt || PERIOD_ORIGIN
    ? { $gt: periodStartAt || PERIOD_ORIGIN }
    : {}),
  ...(periodEndAt ? { $lte: periodEndAt } : {}),
});

const loadSubscriptionSaleSummaries = async ({
  ticketOfficeId,
  periodStartAt,
  periodEndAt = null,
}) => {
  const sales = await SubscriptionSale.find({
    soldBy: ticketOfficeId,
    source: "ticket_office",
    status: { $in: ACTIVE_SUBSCRIPTION_SALE_STATUSES },
    paymentStatus: COMPLETED_SUBSCRIPTION_PAYMENT_STATUS,
    createdAt: buildSalesPeriodFilter({ periodStartAt, periodEndAt }),
  })
    .select(
      "subscriptionCode subscriptionId price totalCredits paymentMethod customerContact createdAt",
    )
    .populate({
      path: "subscriptionId",
      select: "name totalCredits",
    })
    .sort({ createdAt: -1 })
    .lean();

  const subscriptionSales = sales.map((sale) =>
    serializeSubscriptionSaleSummary({
      subscriptionSaleId: sale?._id,
      subscriptionCode: sale?.subscriptionCode,
      createdAt: sale?.createdAt,
      totalAmount: sale?.price,
      paymentMethod: sale?.paymentMethod,
      subscriptionName: sale?.subscriptionId?.name,
      totalCredits: sale?.totalCredits ?? sale?.subscriptionId?.totalCredits,
      customerContact: sale?.customerContact,
    }),
  );

  return {
    subscriptionSales,
    subscriptionSaleCount: subscriptionSales.length,
    amount: roundAmount(
      subscriptionSales.reduce(
        (total, subscriptionSale) => total + (subscriptionSale.totalAmount || 0),
        0,
      ),
    ),
    lastTransactionAt: subscriptionSales[0]?.createdAt || null,
  };
};

const closureHasStoredSubscriptionData = (closure) =>
  Boolean(
    closure &&
      (Object.prototype.hasOwnProperty.call(closure, "subscriptionSaleCount") ||
        Object.prototype.hasOwnProperty.call(closure, "subscriptionSales")),
  );

const hydrateClosureWithSubscriptionSales = async (closure) => {
  if (!closure) {
    return null;
  }

  if (closureHasStoredSubscriptionData(closure)) {
    const subscriptionSales = Array.isArray(closure.subscriptionSales)
      ? closure.subscriptionSales.map(serializeSubscriptionSaleSummary)
      : [];

    return {
      ...closure,
      amount: roundAmount(closure.amount),
      subscriptionSaleCount: Number.isFinite(Number(closure.subscriptionSaleCount))
        ? Number(closure.subscriptionSaleCount)
        : subscriptionSales.length,
      subscriptionSales,
    };
  }

  const fallbackRegister = await loadSubscriptionSaleSummaries({
    ticketOfficeId: closure.ticketOfficeId,
    periodStartAt: closure.periodStartAt,
    periodEndAt: closure.periodEndAt,
  });

  return {
    ...closure,
    amount: roundAmount((Number(closure.amount) || 0) + fallbackRegister.amount),
    subscriptionSaleCount: fallbackRegister.subscriptionSaleCount,
    subscriptionSales: fallbackRegister.subscriptionSales,
  };
};

const hydrateClosuresWithSubscriptionSales = async (closures = []) =>
  Promise.all(closures.map(hydrateClosureWithSubscriptionSales));

const buildTicketLookup = async (bookings = []) => {
  const bookingIds = bookings
    .map((booking) => booking?._id)
    .filter((bookingId) => Boolean(bookingId));

  if (bookingIds.length === 0) {
    return new Map();
  }

  const tickets = await Ticket.find({
    bookingId: { $in: bookingIds },
    status: { $ne: "cancelled" },
  })
    .select("bookingId pricingName price")
    .lean();

  return tickets.reduce((accumulator, ticket) => {
    const bookingId = ticket?.bookingId ? ticket.bookingId.toString() : "";
    if (!bookingId) {
      return accumulator;
    }

    const current = accumulator.get(bookingId) || [];
    current.push(ticket);
    accumulator.set(bookingId, current);
    return accumulator;
  }, new Map());
};

const buildTariffBreakdown = (tickets = []) => {
  const grouped = new Map();

  tickets.forEach((ticket) => {
    const pricingName = ticket?.pricingName || "";
    const price = Number(ticket?.price);
    const safePrice = Number.isFinite(price) ? price : 0;
    const key = `${pricingName}::${safePrice}`;
    const existing = grouped.get(key);

    if (existing) {
      existing.quantity += 1;
      return;
    }

    grouped.set(key, {
      pricingName,
      price: safePrice,
      quantity: 1,
    });
  });

  return Array.from(grouped.values()).sort((left, right) => {
    const byName = left.pricingName.localeCompare(right.pricingName);
    if (byName !== 0) {
      return byName;
    }
    return left.price - right.price;
  });
};

const buildTransactionSummary = (booking, ticketsByBookingId) => {
  const bookingId = booking?._id ? booking._id.toString() : "";
  const tickets = ticketsByBookingId.get(bookingId) || [];
  const fallbackTicketCount = Array.isArray(booking?.seats) ? booking.seats.length : 0;
  const session = booking?.sessionId;
  const event = session?.eventId;

  return {
    bookingId: booking?._id,
    bookingNumber: booking?.bookingNumber || "",
    createdAt: booking?.createdAt || null,
    totalAmount: Number.isFinite(Number(booking?.totalAmount))
      ? Number(booking.totalAmount)
      : 0,
    paymentMethod: booking?.paymentMethod || "",
    ticketCount: tickets.length || fallbackTicketCount,
    usedSubscription:
      booking?.paymentMethod === "subscription" ||
      Boolean(booking?.subscriptionTransaction?.subscriptionCode),
    promotion: serializePromotion(booking?.promotion),
    tariffBreakdown: buildTariffBreakdown(tickets),
    session: {
      eventName: event?.name || "",
      date: session?.date || null,
      sessionTime: session?.sessionTime || "",
    },
  };
};

const loadRegisterTransactions = async ({
  ticketOfficeId,
  periodStartAt,
  periodEndAt = null,
}) => {
  const [bookings, subscriptionRegister] = await Promise.all([
    Booking.find({
      bookedBy: ticketOfficeId,
      bookingSource: "ticket_office",
      status: { $in: ACTIVE_BOOKING_STATUSES },
      createdAt: buildSalesPeriodFilter({ periodStartAt, periodEndAt }),
    })
      .select(
        "bookingNumber sessionId seats totalAmount paymentMethod promotion subscriptionTransaction createdAt",
      )
      .populate({
        path: "sessionId",
        select: "date sessionTime eventId",
        populate: {
          path: "eventId",
          select: "name",
        },
      })
      .sort({ createdAt: -1 })
      .lean(),
    loadSubscriptionSaleSummaries({
      ticketOfficeId,
      periodStartAt,
      periodEndAt,
    }),
  ]);

  const ticketsByBookingId = await buildTicketLookup(bookings);
  const transactions = bookings.map((booking) =>
    buildTransactionSummary(booking, ticketsByBookingId),
  );
  const bookingAmount = roundAmount(
    transactions.reduce(
      (total, transaction) => total + (transaction.totalAmount || 0),
      0,
    ),
  );

  return {
    transactions,
    subscriptionSales: subscriptionRegister.subscriptionSales,
    saleCount: transactions.length + subscriptionRegister.subscriptionSaleCount,
    bookingCount: transactions.length,
    ticketCount: transactions.reduce(
      (total, transaction) => total + (transaction.ticketCount || 0),
      0,
    ),
    subscriptionSaleCount: subscriptionRegister.subscriptionSaleCount,
    amount: roundAmount(
      bookingAmount + (subscriptionRegister.amount || 0),
    ),
    lastTransactionAt: getMostRecentDate(
      transactions[0]?.createdAt,
      subscriptionRegister.lastTransactionAt,
    ),
  };
};

const getSaleCreatedAt = (item) => toValidDate(item?.createdAt);

const itemBelongsToPeriod = ({ item, periodStartAt, periodEndAt }) => {
  const createdAt = getSaleCreatedAt(item);
  if (!createdAt) {
    return false;
  }

  const timestamp = createdAt.getTime();
  return (
    timestamp > getTimestamp(periodStartAt || PERIOD_ORIGIN) &&
    timestamp <= getTimestamp(periodEndAt)
  );
};

const summarizeRegisterPeriod = ({
  businessDate,
  periodStartAt,
  periodEndAt,
  transactions,
  subscriptionSales,
  isAutoClosed,
}) => {
  const safeTransactions = Array.isArray(transactions) ? transactions : [];
  const safeSubscriptionSales = Array.isArray(subscriptionSales)
    ? subscriptionSales
    : [];
  const bookingAmount = safeTransactions.reduce(
    (total, transaction) => total + (transaction.totalAmount || 0),
    0,
  );
  const subscriptionAmount = safeSubscriptionSales.reduce(
    (total, sale) => total + (sale.totalAmount || 0),
    0,
  );

  return {
    id: `${getTimestamp(periodStartAt)}:${getTimestamp(periodEndAt)}`,
    businessDate,
    periodStartAt,
    periodEndAt,
    isAutoClosed,
    amount: roundAmount(bookingAmount + subscriptionAmount),
    saleCount: safeTransactions.length + safeSubscriptionSales.length,
    bookingCount: safeTransactions.length,
    ticketCount: safeTransactions.reduce(
      (total, transaction) => total + (transaction.ticketCount || 0),
      0,
    ),
    subscriptionSaleCount: safeSubscriptionSales.length,
    lastTransactionAt: getMostRecentDate(
      safeTransactions[0]?.createdAt,
      safeSubscriptionSales[0]?.createdAt,
    ),
    transactions: safeTransactions.map(serializeTransactionSummary),
    subscriptionSales: safeSubscriptionSales.map(serializeSubscriptionSaleSummary),
  };
};

const buildPendingRegisterPeriods = ({
  register,
  periodStartAt,
  now = new Date(),
}) => {
  const transactions = Array.isArray(register?.transactions)
    ? register.transactions
    : [];
  const subscriptionSales = Array.isArray(register?.subscriptionSales)
    ? register.subscriptionSales
    : [];
  const saleDates = [...transactions, ...subscriptionSales]
    .map(getSaleCreatedAt)
    .filter(Boolean)
    .sort((left, right) => left.getTime() - right.getTime());

  if (saleDates.length === 0) {
    return [];
  }

  const safeNow = toValidDate(now) || new Date();
  const baseStart = toValidDate(periodStartAt) || PERIOD_ORIGIN;
  const firstSaleDay = startOfBusinessDay(saleDates[0]);
  const todayStart = startOfBusinessDay(safeNow);
  const periods = [];

  for (
    let dayStart = firstSaleDay;
    dayStart.getTime() <= todayStart.getTime();
    dayStart = addBusinessDays(dayStart, 1)
  ) {
    const nextDayStart = addBusinessDays(dayStart, 1);
    const periodStart =
      periods.length === 0 && baseStart.getTime() < nextDayStart.getTime()
        ? baseStart
        : dayStart;
    const periodEnd =
      nextDayStart.getTime() <= safeNow.getTime() ? nextDayStart : safeNow;

    if (periodEnd.getTime() <= periodStart.getTime()) {
      continue;
    }

    const periodTransactions = transactions.filter((transaction) =>
      itemBelongsToPeriod({
        item: transaction,
        periodStartAt: periodStart,
        periodEndAt: periodEnd,
      }),
    );
    const periodSubscriptionSales = subscriptionSales.filter((sale) =>
      itemBelongsToPeriod({
        item: sale,
        periodStartAt: periodStart,
        periodEndAt: periodEnd,
      }),
    );

    if (periodTransactions.length === 0 && periodSubscriptionSales.length === 0) {
      continue;
    }

    periods.push(
      summarizeRegisterPeriod({
        businessDate: dayStart,
        periodStartAt: periodStart,
        periodEndAt: periodEnd,
        transactions: periodTransactions,
        subscriptionSales: periodSubscriptionSales,
        isAutoClosed: nextDayStart.getTime() <= safeNow.getTime(),
      }),
    );
  }

  return periods;
};

const loadTicketOfficePendingPeriods = async ({
  ticketOfficeId,
  periodStartAt,
}) => {
  const register = await loadRegisterTransactions({
    ticketOfficeId,
    periodStartAt,
  });
  return buildPendingRegisterPeriods({
    register,
    periodStartAt,
  });
};

const loadCashierRegisterTransfers = async ({ cashierId, periodStartAt }) => {
  const query = {
    cashierId,
    closedAt: { $gt: periodStartAt || PERIOD_ORIGIN },
  };

  const closures = await CashRegisterClosure.find(query)
    .sort({ closedAt: -1, createdAt: -1 })
    .lean();
  const hydratedClosures = await hydrateClosuresWithSubscriptionSales(closures);
  const transfers = hydratedClosures.map(serializeCashierTransfer);

  return {
    transfers,
    transferCount: transfers.length,
    bookingCount: transfers.reduce(
      (total, transfer) => total + (transfer.bookingCount || 0),
      0,
    ),
    ticketCount: transfers.reduce(
      (total, transfer) => total + (transfer.ticketCount || 0),
      0,
    ),
    subscriptionSaleCount: transfers.reduce(
      (total, transfer) => total + (transfer.subscriptionSaleCount || 0),
      0,
    ),
    amount: roundAmount(
      transfers.reduce((total, transfer) => total + (transfer.amount || 0), 0),
    ),
    lastTransferAt: transfers[0]?.closedAt || null,
  };
};

const getCashierBalance = async (cashierId) => {
  const lastClosure = await getLastCashierClosure(cashierId);
  const register = await loadCashierRegisterTransfers({
    cashierId,
    periodStartAt: lastClosure?.periodEndAt || PERIOD_ORIGIN,
  });

  return {
    totalAmount: register.amount,
    closureCount: register.transferCount,
    bookingCount: register.bookingCount,
    ticketCount: register.ticketCount,
    subscriptionSaleCount: register.subscriptionSaleCount,
    lastClosedAt: register.lastTransferAt,
  };
};

const buildCashierRegisterTicketItems = async (closures = []) => {
  const transactions = closures.flatMap((closure) =>
    (Array.isArray(closure?.transactions) ? closure.transactions : []).map(
      (transaction) => ({
        ...transaction,
        ticketOfficeSnapshot: closure?.ticketOfficeSnapshot || null,
        transferClosedAt: closure?.closedAt || null,
      }),
    ),
  );

  const bookingIds = Array.from(
    new Set(
      transactions
        .map((transaction) =>
          transaction?.bookingId ? String(transaction.bookingId) : "",
        )
        .filter(Boolean),
    ),
  );

  if (bookingIds.length === 0) {
    return {
      items: [],
      amount: 0,
      bookingCount: 0,
      ticketCount: 0,
    };
  }

  const [bookings, tickets] = await Promise.all([
    Booking.find({
      _id: { $in: bookingIds },
    })
      .select("bookingNumber totalAmount paymentMethod promotion status createdAt")
      .lean(),
    Ticket.find({
      bookingId: { $in: bookingIds },
      status: { $ne: "cancelled" },
    })
      .select("bookingId code seat pricingName price createdAt")
      .lean(),
  ]);

  const bookingsById = bookings.reduce((accumulator, booking) => {
    accumulator.set(String(booking._id), booking);
    return accumulator;
  }, new Map());

  const ticketsByBookingId = tickets.reduce((accumulator, ticket) => {
    const bookingId = ticket?.bookingId ? String(ticket.bookingId) : "";

    if (!bookingId) {
      return accumulator;
    }

    const existing = accumulator.get(bookingId) || [];
    existing.push(ticket);
    accumulator.set(bookingId, existing);
    return accumulator;
  }, new Map());

  const items = transactions.flatMap((transaction) => {
    const bookingId = transaction?.bookingId ? String(transaction.bookingId) : "";
    const booking = bookingsById.get(bookingId);

    if (!booking) {
      return [];
    }

    const promotion = serializePromotion(booking?.promotion);
    const usedSubscription =
      booking?.paymentMethod === "subscription" ||
      transaction?.usedSubscription === true;
    const rawTickets = (ticketsByBookingId.get(bookingId) || [])
      .map((ticket) => ({
        id: ticket?._id ? String(ticket._id) : "",
        code: ticket?.code || "",
        seat: {
          row: ticket?.seat?.row || "",
          col:
            ticket?.seat?.col === 0 || Number.isFinite(Number(ticket?.seat?.col))
              ? Number(ticket.seat.col)
              : null,
        },
        pricingName: ticket?.pricingName || "",
        price: roundAmount(ticket?.price),
        createdAt: ticket?.createdAt || null,
      }))
      .sort((left, right) => {
        const rowCompare = String(left?.seat?.row || "").localeCompare(
          String(right?.seat?.row || ""),
        );
        if (rowCompare !== 0) {
          return rowCompare;
        }

        const leftCol = Number.isFinite(Number(left?.seat?.col))
          ? Number(left.seat.col)
          : Number.MAX_SAFE_INTEGER;
        const rightCol = Number.isFinite(Number(right?.seat?.col))
          ? Number(right.seat.col)
          : Number.MAX_SAFE_INTEGER;

        if (leftCol !== rightCol) {
          return leftCol - rightCol;
        }

        return String(left?.code || "").localeCompare(String(right?.code || ""));
      });

    const ticketsForDisplay =
      rawTickets.length > 0
        ? rawTickets
        : buildFallbackTicketsFromBreakdown(transaction);

    if (ticketsForDisplay.length === 0) {
      return [];
    }

    const pricedTickets = distributeFinalTicketAmounts({
      tickets: ticketsForDisplay,
      bookingTotalAmount: booking?.totalAmount,
      usedSubscription,
    });

    return pricedTickets.map((ticket) => ({
      id: ticket.id || `${bookingId}:${ticket.code || `${ticket.seat?.row || "X"}-${ticket.seat?.col || 0}`}`,
      bookingId,
      bookingNumber:
        booking?.bookingNumber || transaction?.bookingNumber || "",
      soldAt: booking?.createdAt || transaction?.createdAt || ticket?.createdAt || null,
      transferClosedAt: transaction?.transferClosedAt || null,
      ticketOffice: {
        firstName: transaction?.ticketOfficeSnapshot?.firstName || "",
        lastName: transaction?.ticketOfficeSnapshot?.lastName || "",
        email: transaction?.ticketOfficeSnapshot?.email || "",
      },
      session: transaction?.session
        ? {
            eventName: transaction.session.eventName || "",
            date: transaction.session.date || null,
            sessionTime: transaction.session.sessionTime || "",
          }
        : null,
      code: ticket.code || "",
      seat: {
        row: ticket?.seat?.row || "",
        col:
          ticket?.seat?.col === 0 || Number.isFinite(Number(ticket?.seat?.col))
            ? Number(ticket.seat.col)
            : null,
      },
      pricingName: ticket.pricingName || "",
      basePrice: roundAmount(ticket.basePrice),
      finalPrice: roundAmount(ticket.finalPrice),
      reductionAmount: roundAmount(ticket.reductionAmount),
      paymentMethod: booking?.paymentMethod || transaction?.paymentMethod || "",
      usedSubscription,
      promotion: promotion
        ? {
            ...promotion,
            reductionLabel: buildReductionValueLabel(promotion),
          }
        : null,
    }));
  });

  const bookingCount = new Set(items.map((item) => item.bookingId).filter(Boolean)).size;

  return {
    items: items.sort(
      (left, right) =>
        new Date(right?.soldAt || 0).getTime() - new Date(left?.soldAt || 0).getTime(),
    ),
    amount: roundAmount(items.reduce((sum, item) => sum + (item.finalPrice || 0), 0)),
    bookingCount,
    ticketCount: items.length,
  };
};

const buildCashierRegisterSubscriptionItems = async (closures = []) => {
  const items = closures.flatMap((closure) =>
    (Array.isArray(closure?.subscriptionSales) ? closure.subscriptionSales : []).map(
      (subscriptionSale) => ({
        id:
          subscriptionSale?.subscriptionSaleId
            ? String(subscriptionSale.subscriptionSaleId)
            : `${closure?._id || "closure"}:${subscriptionSale?.subscriptionCode || "subscription"}`,
        subscriptionSaleId: subscriptionSale?.subscriptionSaleId
          ? String(subscriptionSale.subscriptionSaleId)
          : "",
        subscriptionCode: subscriptionSale?.subscriptionCode || "",
        soldAt: subscriptionSale?.createdAt || null,
        transferClosedAt: closure?.closedAt || null,
        ticketOffice: {
          firstName: closure?.ticketOfficeSnapshot?.firstName || "",
          lastName: closure?.ticketOfficeSnapshot?.lastName || "",
          email: closure?.ticketOfficeSnapshot?.email || "",
        },
        subscriptionName: subscriptionSale?.subscriptionName || "",
        totalCredits: Number.isFinite(Number(subscriptionSale?.totalCredits))
          ? Number(subscriptionSale.totalCredits)
          : 0,
        totalAmount: roundAmount(subscriptionSale?.totalAmount),
        paymentMethod: subscriptionSale?.paymentMethod || "",
        customerContact: serializeCustomerContact(subscriptionSale?.customerContact),
      }),
    ),
  );

  return {
    items: items.sort(
      (left, right) =>
        new Date(right?.soldAt || 0).getTime() - new Date(left?.soldAt || 0).getTime(),
    ),
    amount: roundAmount(items.reduce((sum, item) => sum + (item.totalAmount || 0), 0)),
    subscriptionSaleCount: items.length,
  };
};

const listTicketOfficeRegisters = async ({ cashierId }) => {
  const cashier = await getCashierUser(cashierId);
  const ticketOffices = await User.find({ role: TICKET_OFFICE_ROLE })
    .select("_id firstName lastName email role status")
    .sort({ lastName: 1, firstName: 1, createdAt: 1 })
    .lean();
  const cashierBalance = await getCashierBalance(cashierId);

  const items = await Promise.all(
    ticketOffices.map(async (ticketOffice) => {
      const lastClosure = await getLastClosureForTicketOffice(ticketOffice._id);
      const currentPeriodStart = lastClosure?.periodEndAt || PERIOD_ORIGIN;
      const register = await loadRegisterTransactions({
        ticketOfficeId: ticketOffice._id,
        periodStartAt: currentPeriodStart,
      });
      const pendingPeriods = buildPendingRegisterPeriods({
        register,
        periodStartAt: currentPeriodStart,
      });

      return {
        staff: serializeStaff(ticketOffice),
        currentBalance: {
          amount: register.amount,
          saleCount: register.saleCount,
          bookingCount: register.bookingCount,
          ticketCount: register.ticketCount,
          subscriptionSaleCount: register.subscriptionSaleCount,
          lastTransactionAt: register.lastTransactionAt,
          pendingPeriodCount: pendingPeriods.length,
          oldestPendingPeriodAt: pendingPeriods[0]?.businessDate || null,
        },
        pendingPeriods: pendingPeriods.map((period) => ({
          id: period.id,
          businessDate: period.businessDate,
          periodStartAt: period.periodStartAt,
          periodEndAt: period.periodEndAt,
          isAutoClosed: period.isAutoClosed,
          amount: period.amount,
          saleCount: period.saleCount,
          bookingCount: period.bookingCount,
          ticketCount: period.ticketCount,
          subscriptionSaleCount: period.subscriptionSaleCount,
          lastTransactionAt: period.lastTransactionAt,
        })),
        lastClosure: lastClosure
          ? {
              id: lastClosure._id.toString(),
              amount: Number(lastClosure.amount) || 0,
              closedAt: lastClosure.closedAt || lastClosure.periodEndAt || null,
            }
          : null,
      };
    }),
  );

  return {
    cashier: serializeStaff(cashier),
    cashierBalance,
    ticketOffices: items,
  };
};

const getTicketOfficeRegisterDetails = async ({ ticketOfficeId }) => {
  const ticketOffice = await getTicketOfficeUser(ticketOfficeId);
  const lastClosure = await getLastClosureForTicketOffice(ticketOfficeId);
  const periodStartAt = lastClosure?.periodEndAt || PERIOD_ORIGIN;
  const register = await loadRegisterTransactions({
    ticketOfficeId,
    periodStartAt,
  });
  const pendingPeriods = buildPendingRegisterPeriods({
    register,
    periodStartAt,
  });

  return {
    staff: serializeStaff(ticketOffice),
    currentBalance: {
      amount: register.amount,
      saleCount: register.saleCount,
      bookingCount: register.bookingCount,
      ticketCount: register.ticketCount,
      subscriptionSaleCount: register.subscriptionSaleCount,
      lastTransactionAt: register.lastTransactionAt,
      pendingPeriodCount: pendingPeriods.length,
      oldestPendingPeriodAt: pendingPeriods[0]?.businessDate || null,
    },
    lastClosure: lastClosure ? serializeClosure(lastClosure) : null,
    pendingPeriods,
    transactions: register.transactions.map(serializeTransactionSummary),
    subscriptionSales: register.subscriptionSales.map(serializeSubscriptionSaleSummary),
  };
};

const listCashierRegisters = async ({ supervisorId }) => {
  await getSupervisorUser(supervisorId);

  const cashiers = await User.find({ role: CASHIER_ROLE })
    .select("_id firstName lastName email role status")
    .sort({ lastName: 1, firstName: 1, createdAt: 1 })
    .lean();

  const items = await Promise.all(
    cashiers.map(async (cashier) => {
      const lastClosure = await getLastCashierClosure(cashier._id);
      const currentPeriodStart = lastClosure?.periodEndAt || PERIOD_ORIGIN;
      const register = await loadCashierRegisterTransfers({
        cashierId: cashier._id,
        periodStartAt: currentPeriodStart,
      });

      return {
        staff: serializeStaff(cashier),
        currentBalance: {
          amount: register.amount,
          transferCount: register.transferCount,
          bookingCount: register.bookingCount,
          ticketCount: register.ticketCount,
          subscriptionSaleCount: register.subscriptionSaleCount,
          lastTransferAt: register.lastTransferAt,
        },
        lastClosure: lastClosure
          ? {
              id: lastClosure._id.toString(),
              amount: Number(lastClosure.amount) || 0,
              closedAt: lastClosure.closedAt || lastClosure.periodEndAt || null,
            }
          : null,
      };
    }),
  );

  return {
    cashiers: items,
  };
};

const getCashierRegisterDetails = async ({ cashierId, supervisorId }) => {
  const [cashier, lastClosure] = await Promise.all([
    getCashierUser(cashierId),
    getLastCashierClosure(cashierId),
    getSupervisorUser(supervisorId),
  ]);
  const periodStartAt = lastClosure?.periodEndAt || PERIOD_ORIGIN;
  const register = await loadCashierRegisterTransfers({
    cashierId,
    periodStartAt,
  });
  const closures = await CashRegisterClosure.find({
    cashierId,
    closedAt: { $gt: periodStartAt || PERIOD_ORIGIN },
  })
    .sort({ closedAt: -1, createdAt: -1 })
    .lean();
  const hydratedClosures = await hydrateClosuresWithSubscriptionSales(closures);
  const ticketRegister = await buildCashierRegisterTicketItems(hydratedClosures);
  const subscriptionRegister = await buildCashierRegisterSubscriptionItems(
    hydratedClosures,
  );

  return {
    staff: serializeStaff(cashier),
    currentBalance: {
      amount: roundAmount(ticketRegister.amount + subscriptionRegister.amount),
      transferCount: register.transferCount,
      bookingCount: ticketRegister.bookingCount,
      ticketCount: ticketRegister.ticketCount,
      subscriptionSaleCount: subscriptionRegister.subscriptionSaleCount,
      lastTransferAt: register.lastTransferAt,
    },
    lastClosure: lastClosure ? serializeCashierClosure(lastClosure) : null,
    transfers: register.transfers,
    ticketItems: ticketRegister.items,
    subscriptionSales: subscriptionRegister.items,
  };
};

const closeCashierRegister = async ({ cashierId, supervisorId }) => {
  const [cashier, supervisor, lastClosure] = await Promise.all([
    getCashierUser(cashierId),
    getSupervisorUser(supervisorId),
    getLastCashierClosure(cashierId),
  ]);

  const periodStartAt = lastClosure?.periodEndAt || PERIOD_ORIGIN;
  const register = await loadCashierRegisterTransfers({
    cashierId,
    periodStartAt,
  });

  if (register.transferCount === 0) {
    const error = new Error("Aucune caisse caissier à clôturer.");
    error.status = 400;
    throw error;
  }

  const closedAt = new Date();
  let closure;

  try {
    closure = await CashierRegisterClosure.create({
      cashierId,
      cashierSnapshot: buildStaffSnapshot(cashier),
      closedById: supervisorId,
      closedBySnapshot: buildStaffSnapshot(supervisor),
      periodStartAt,
      periodEndAt: closedAt,
      closedAt,
      amount: register.amount,
      transferCount: register.transferCount,
      bookingCount: register.bookingCount,
      ticketCount: register.ticketCount,
      subscriptionSaleCount: register.subscriptionSaleCount,
      transfers: register.transfers.map((transfer) => ({
        cashRegisterClosureId: transfer.id,
        ticketOfficeId: transfer.ticketOffice.id,
        ticketOfficeSnapshot: buildStaffSnapshot(transfer.ticketOffice),
        periodStartAt: transfer.periodStartAt,
        periodEndAt: transfer.periodEndAt,
        closedAt: transfer.closedAt,
        amount: transfer.amount,
        bookingCount: transfer.bookingCount,
        ticketCount: transfer.ticketCount,
        subscriptionSaleCount: transfer.subscriptionSaleCount,
      })),
    });
  } catch (error) {
    if (error?.code === 11000) {
      const conflictError = new Error(
        "La caisse de ce caissier vient déjà d'être clôturée",
      );
      conflictError.status = 409;
      throw conflictError;
    }

    throw error;
  }

  return {
    closure: serializeCashierClosure(closure),
  };
};

const listSupervisorCashierClosures = async ({
  supervisorId,
  limit = 200,
  maxLimit = 500,
  dateFrom,
  dateTo,
}) => {
  await getSupervisorUser(supervisorId);

  const safeMaxLimit = Math.max(Number.parseInt(maxLimit, 10) || 500, 1);
  const safeLimit = Math.min(
    Math.max(Number.parseInt(limit, 10) || 200, 1),
    safeMaxLimit,
  );
  const query = {};
  const closedAtFilter = buildClosedAtFilter({ dateFrom, dateTo });
  if (closedAtFilter) {
    query.closedAt = closedAtFilter;
  }

  const closures = await CashierRegisterClosure.find(query)
    .sort({ closedAt: -1, createdAt: -1 })
    .limit(safeLimit)
    .lean();

  return {
    items: closures.map(serializeCashierClosure),
  };
};

const closeTicketOfficeRegister = async ({
  ticketOfficeId,
  cashierId,
  periodStartAt: requestedPeriodStartAt = null,
}) => {
  const [ticketOffice, cashier, lastClosure] = await Promise.all([
    getTicketOfficeUser(ticketOfficeId),
    getCashierUser(cashierId),
    getLastClosureForTicketOffice(ticketOfficeId),
  ]);

  const openPeriodStartAt = lastClosure?.periodEndAt || PERIOD_ORIGIN;
  const pendingPeriods = await loadTicketOfficePendingPeriods({
    ticketOfficeId,
    periodStartAt: openPeriodStartAt,
  });

  if (pendingPeriods.length === 0) {
    const error = new Error("Aucune vente à clôturer pour ce guichet");
    error.status = 400;
    throw error;
  }

  const requestedPeriodStart = toValidDate(requestedPeriodStartAt);
  const selectedPeriod = requestedPeriodStart
    ? pendingPeriods.find(
        (period) =>
          getTimestamp(period.periodStartAt) === requestedPeriodStart.getTime(),
      )
    : pendingPeriods[0];

  if (!selectedPeriod) {
    const error = new Error("Feuille de caisse introuvable ou déjà clôturée.");
    error.status = 404;
    throw error;
  }

  if (selectedPeriod.id !== pendingPeriods[0].id) {
    const error = new Error("Clôturez d'abord la feuille la plus ancienne.");
    error.status = 409;
    throw error;
  }

  const register = await loadRegisterTransactions({
    ticketOfficeId,
    periodStartAt: selectedPeriod.periodStartAt,
    periodEndAt: selectedPeriod.periodEndAt,
  });

  if (register.saleCount === 0) {
    const error = new Error("Aucune vente à clôturer pour cette feuille.");
    error.status = 400;
    throw error;
  }

  const closedAt = new Date();

  let closure;

  try {
    closure = await CashRegisterClosure.create({
      ticketOfficeId,
      ticketOfficeSnapshot: buildStaffSnapshot(ticketOffice),
      cashierId,
      cashierSnapshot: buildStaffSnapshot(cashier),
      periodStartAt: selectedPeriod.periodStartAt,
      periodEndAt: selectedPeriod.periodEndAt,
      closedAt,
      amount: register.amount,
      bookingCount: register.bookingCount,
      ticketCount: register.ticketCount,
      subscriptionSaleCount: register.subscriptionSaleCount,
      transactions: register.transactions,
      subscriptionSales: register.subscriptionSales,
    });
  } catch (error) {
    if (error?.code === 11000) {
      const conflictError = new Error(
        "La caisse de ce guichet vient déjà d'être clôturée",
      );
      conflictError.status = 409;
      throw conflictError;
    }

    throw error;
  }

  const cashierBalance = await getCashierBalance(cashierId);

  return {
    closure: serializeClosure(closure),
    cashierBalance,
  };
};

const listCashierClosures = async ({ cashierId, limit = 200 }) => {
  await getCashierUser(cashierId);

  const safeLimit = Math.min(
    Math.max(Number.parseInt(limit, 10) || 200, 1),
    500,
  );

  const closures = await CashRegisterClosure.find({ cashierId })
    .sort({ closedAt: -1, createdAt: -1 })
    .limit(safeLimit)
    .lean();
  const hydratedClosures = await hydrateClosuresWithSubscriptionSales(closures);

  const cashierBalance = await getCashierBalance(cashierId);

  return {
    cashierBalance,
    items: hydratedClosures.map(serializeClosure),
  };
};

const getCashierClosureDetails = async ({ closureId, cashierId }) => {
  await getCashierUser(cashierId);
  ensureValidObjectId(closureId, "Clôture");

  const closure = await CashRegisterClosure.findOne({
    _id: closureId,
    cashierId,
  }).lean();

  if (!closure) {
    const error = new Error("Clôture introuvable");
    error.status = 404;
    throw error;
  }

  const hydratedClosure = await hydrateClosureWithSubscriptionSales(closure);

  return serializeClosure(hydratedClosure);
};

module.exports = {
  closeCashierRegister,
  closeTicketOfficeRegister,
  getCashierRegisterDetails,
  getCashierClosureDetails,
  getTicketOfficeRegisterDetails,
  listCashierRegisters,
  listCashierClosures,
  listTicketOfficeRegisters,
  listSupervisorCashierClosures,
};
