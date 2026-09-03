const mongoose = require("mongoose");

const Booking = require("../models/Booking");
const Event = require("../models/Event");
const Session = require("../models/Session");
const Ticket = require("../models/Ticket");
const Subscription = require("../models/Subscription");
const SubscriptionSale = require("../models/SubscriptionSale");

const ACTIVE_BOOKING_STATUSES = ["confirmed", "used"];
const DAY_MS = 24 * 60 * 60 * 1000;

let cachedPdfKit = null;

const getPdfKit = () => {
  if (!cachedPdfKit) {
    cachedPdfKit = require("pdfkit");
  }

  return cachedPdfKit;
};

const ensureValidEventId = (value) => {
  if (!value) {
    return "";
  }

  if (!mongoose.isValidObjectId(value)) {
    const error = new Error("Événement invalide");
    error.status = 400;
    throw error;
  }

  return String(value);
};

const normalizeSessionTimeFilter = (value) => {
  if (!value) {
    return "";
  }

  if (typeof value !== "string") {
    const error = new Error("Heure de séance invalide");
    error.status = 400;
    throw error;
  }

  const normalized = value.trim();
  if (!normalized) {
    return "";
  }

  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(normalized)) {
    const error = new Error("Heure de séance invalide");
    error.status = 400;
    throw error;
  }

  return normalized;
};

const parseDateFilter = (value, { endOfDay = false } = {}) => {
  if (!value || typeof value !== "string") {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  if (endOfDay) {
    date.setHours(23, 59, 59, 999);
  } else {
    date.setHours(0, 0, 0, 0);
  }

  return date;
};

const formatDayKey = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatDateLabel = (value) => {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

const formatDateTimeLabel = (value) => {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatCurrency = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return "-";
  }

  const formatted = amount
    .toLocaleString("fr-FR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
    .replace(/[\u00A0\u202F]/g, " ");

  return `${formatted} DT`;
};

const formatPricingAmount = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return "";
  }

  return amount
    .toLocaleString("fr-FR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
    .replace(/[\u00A0\u202F]/g, " ");
};

const combineSessionDateTime = (dateValue, sessionTime) => {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const [hours, minutes] = String(sessionTime || "00:00")
    .split(":")
    .map((part) => Number.parseInt(part, 10));

  date.setHours(
    Number.isFinite(hours) ? hours : 0,
    Number.isFinite(minutes) ? minutes : 0,
    0,
    0,
  );

  return date;
};

const getSessionDayStart = (dateValue) => {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  date.setHours(0, 0, 0, 0);
  return date;
};

const createAccumulator = (base = {}) => ({
  ticketsSold: 0,
  bookingCount: 0,
  revenue: 0,
  ...base,
});

const incrementMap = (map, key, patch = {}) => {
  const current = map.get(key) || createAccumulator();
  map.set(key, {
    ...current,
    ...patch,
    ticketsSold: current.ticketsSold + (patch.ticketsSold || 0),
    bookingCount: current.bookingCount + (patch.bookingCount || 0),
    revenue: current.revenue + (patch.revenue || 0),
    sessionCount: (current.sessionCount || 0) + (patch.sessionCount || 0),
    discountAmount:
      (current.discountAmount || 0) + (patch.discountAmount || 0),
  });
};

const sortSessionRows = (items = []) =>
  [...items].sort((left, right) => {
    const leftDate = combineSessionDateTime(left.date, left.sessionTime);
    const rightDate = combineSessionDateTime(right.date, right.sessionTime);
    const leftTime = leftDate ? leftDate.getTime() : 0;
    const rightTime = rightDate ? rightDate.getTime() : 0;
    return leftTime - rightTime;
  });

const mapToSortedArray = (map, sorter) =>
  Array.from(map.entries())
    .map(([key, value]) => ({ key, ...value }))
    .sort(sorter);

const getPricingColumnKey = (pricingName, price) => {
  const name = String(pricingName || "Tarif").trim() || "Tarif";
  const numPrice = Number(price) || 0;
  return `${name}___${numPrice}`;
};

const isSubscriptionBooking = (booking) =>
  booking?.paymentMethod === "subscription" ||
  Boolean(booking?.subscriptionTransaction?.subscriptionCode) ||
  Boolean(booking?.subscriptionTransaction?.subscriptionSaleId) ||
  Boolean(booking?.subscriptionTransaction?.subscriptionId);

const buildPricingBreakdown = (tickets = []) => {
  const pricingMap = new Map();

  tickets.forEach((ticket) => {
    const pricingName =
      String(ticket?.pricingName || "Tarif").trim() || "Tarif";
    const price = Number(ticket?.price) || 0;
    const key = `${pricingName}:${price}`;
    const current = pricingMap.get(key) || {
      pricingName,
      price,
      ticketsSold: 0,
      revenue: 0,
    };

    pricingMap.set(key, {
      ...current,
      ticketsSold: current.ticketsSold + 1,
      revenue: current.revenue + price,
    });
  });

  return Array.from(pricingMap.values()).sort((left, right) => {
    const byCount = right.ticketsSold - left.ticketsSold;
    if (byCount !== 0) {
      return byCount;
    }

    return left.pricingName.localeCompare(right.pricingName, "fr");
  });
};

const formatPricingBreakdownLabel = (items = []) => {
  if (!Array.isArray(items) || items.length === 0) {
    return "-";
  }

  return items
    .map((item) => {
      const priceLabel = formatPricingAmount(item?.price);
      const pricingLabel = priceLabel
        ? `${item.pricingName} (${priceLabel} DT)`
        : item.pricingName;
      return `${pricingLabel}: ${item.ticketsSold || 0}`;
    })
    .join("\n");
};

const formatPricingSummaryInline = (items = []) => {
  if (!Array.isArray(items) || items.length === 0) {
    return "";
  }

  return items
    .map((item) => {
      const name =
        String(item?.pricingName || item?.label || "Tarif").trim() || "Tarif";
      const priceLabel = formatPricingAmount(item?.price);
      const label = priceLabel ? `${name} (${priceLabel} DT)` : name;
      return `${label}: ${item?.ticketsSold || 0}`;
    })
    .join("   ");
};

const computeDynamicColumnWidths = (contentWidth, pricingColsCount) => {
  if (pricingColsCount <= 0) {
    return [
      contentWidth * 0.28,
      contentWidth * 0.20,
      contentWidth * 0.12,
      contentWidth * 0.15,
      contentWidth * 0.12,
      contentWidth * 0.13,
    ];
  }

  let wEvent = Math.max(110, contentWidth * 0.18);
  let wSession = Math.max(95, contentWidth * 0.14);
  let wSold = Math.max(50, contentWidth * 0.07);
  let wSub = Math.max(70, contentWidth * 0.10);
  let wPromo = Math.max(55, contentWidth * 0.08);
  let wRev = Math.max(65, contentWidth * 0.09);

  let baseSum = wEvent + wSession + wSold + wSub + wPromo + wRev;
  let remaining = contentWidth - baseSum;

  const minPricingWidth = 48;
  if (remaining < pricingColsCount * minPricingWidth) {
    const deficit = pricingColsCount * minPricingWidth - remaining;
    const factor = Math.max(0.55, (baseSum - deficit) / baseSum);
    wEvent *= factor;
    wSession *= factor;
    wSold *= factor;
    wSub *= factor;
    wPromo *= factor;
    wRev *= factor;
    baseSum = wEvent + wSession + wSold + wSub + wPromo + wRev;
    remaining = contentWidth - baseSum;
  }

  const wPricingCol = remaining / pricingColsCount;
  const pricingWidths = Array(pricingColsCount).fill(wPricingCol);

  return [wEvent, wSession, wSold, ...pricingWidths, wSub, wPromo, wRev];
};

const buildStatistics = async ({ dateStart, dateEnd, eventId, sessionTime }) => {
  const resolvedEventId = ensureValidEventId(eventId);
  const resolvedSessionTime = normalizeSessionTimeFilter(sessionTime);
  const startDate = parseDateFilter(dateStart);
  const endDate = parseDateFilter(dateEnd, { endOfDay: true });

  const baseSessionQuery = {};

  if (resolvedEventId) {
    baseSessionQuery.eventId = resolvedEventId;
  }

  if (startDate || endDate) {
    baseSessionQuery.date = {};
    if (startDate) {
      baseSessionQuery.date.$gte = startDate;
    }
    if (endDate) {
      baseSessionQuery.date.$lte = endDate;
    }
  }

  const filterSessions = await Session.find(baseSessionQuery)
    .select("sessionTime")
    .sort({ sessionTime: 1 })
    .lean();

  const availableSessionTimes = Array.from(
    new Set(
      filterSessions
        .map((session) => String(session?.sessionTime || "").trim())
        .filter(Boolean),
    ),
  );

  const sessionQuery = {
    ...baseSessionQuery,
    ...(resolvedSessionTime ? { sessionTime: resolvedSessionTime } : {}),
  };

  const sessions = await Session.find(sessionQuery)
    .select("eventId date sessionTime totalSeats availableSeats status")
    .populate({ path: "eventId", select: "name type status" })
    .sort({ date: 1, sessionTime: 1 })
    .lean();

  const sessionIds = sessions.map((session) => session._id);

  if (sessionIds.length === 0) {
    return {
      filters: {
        dateStart: dateStart || "",
        dateEnd: dateEnd || "",
        eventId: resolvedEventId,
        sessionTime: resolvedSessionTime,
      },
      availableSessionTimes,
      pricingColumns: [],
      totals: {
        sessionsCount: 0,
        soldTickets: 0,
        regularTicketsSold: 0,
        remainingTickets: 0,
        subscriptionTickets: 0,
        subscriptionRevenue: 0,
        regularRevenue: 0,
        promotionDiscountAmount: 0,
        revenue: 0,
        bookingsCount: 0,
      },
      sessionRows: [],
      charts: {
        sessionTimes: [],
        pricing: [],
        saleDays: [],
        leadTimes: [],
        saleHours: [],
        platforms: [],
        subscriptionUsage: [],
        promoUsage: [],
      },
    };
  }

  const bookings = await Booking.find({
    sessionId: { $in: sessionIds },
    status: { $in: ACTIVE_BOOKING_STATUSES },
  })
    .select(
      "sessionId seats totalAmount paymentMethod promotion bookingSource createdAt subscriptionTransaction",
    )
    .sort({ createdAt: 1 })
    .lean();

  const bookingIds = bookings.map((booking) => booking._id);
  const tickets = bookingIds.length
    ? await Ticket.find({ bookingId: { $in: bookingIds } })
        .select("bookingId pricingName price")
        .lean()
    : [];

  const subscriptionSaleIds = Array.from(
    new Set(
      bookings
        .map((booking) => booking?.subscriptionTransaction?.subscriptionSaleId)
        .filter(Boolean)
        .map((id) => id.toString()),
    ),
  );
  const subscriptionIds = Array.from(
    new Set(
      bookings
        .map((booking) => booking?.subscriptionTransaction?.subscriptionId)
        .filter(Boolean)
        .map((id) => id.toString()),
    ),
  );
  const subscriptionCodes = Array.from(
    new Set(
      bookings
        .map((booking) =>
          String(booking?.subscriptionTransaction?.subscriptionCode || "")
            .trim()
            .toUpperCase(),
        )
        .filter(Boolean),
    ),
  );

  const [subscriptionSalesByIdList, subscriptionSalesByCodeList, subscriptionsList] =
    await Promise.all([
      subscriptionSaleIds.length
        ? SubscriptionSale.find({ _id: { $in: subscriptionSaleIds } })
            .select("price totalCredits subscriptionId subscriptionCode")
            .lean()
        : [],
      subscriptionCodes.length
        ? SubscriptionSale.find({ subscriptionCode: { $in: subscriptionCodes } })
            .select("price totalCredits subscriptionId subscriptionCode")
            .lean()
        : [],
      subscriptionIds.length
        ? Subscription.find({ _id: { $in: subscriptionIds } })
            .select("price totalCredits name")
            .lean()
        : [],
    ]);

  const subscriptionSaleByIdMap = new Map(
    subscriptionSalesByIdList.map((item) => [item._id.toString(), item]),
  );
  const subscriptionSaleByCodeMap = new Map(
    subscriptionSalesByCodeList.map((item) => [
      String(item.subscriptionCode || "").trim().toUpperCase(),
      item,
    ]),
  );
  const subscriptionByIdMap = new Map(
    subscriptionsList.map((item) => [item._id.toString(), item]),
  );

  const getBookingSubscriptionRevenue = (booking) => {
    if (!isSubscriptionBooking(booking)) {
      return 0;
    }

    const tx = booking.subscriptionTransaction || {};
    const saleId = tx.subscriptionSaleId ? tx.subscriptionSaleId.toString() : "";
    const code = String(tx.subscriptionCode || "").trim().toUpperCase();
    const subId = tx.subscriptionId ? tx.subscriptionId.toString() : "";

    const sale =
      (saleId ? subscriptionSaleByIdMap.get(saleId) : null) ||
      (code ? subscriptionSaleByCodeMap.get(code) : null);
    const sub = subId ? subscriptionByIdMap.get(subId) : null;

    let unitPrice = 0;
    if (sale && Number.isFinite(sale.price) && Number(sale.totalCredits) > 0) {
      unitPrice = Number(sale.price) / Number(sale.totalCredits);
    } else if (sub && Number.isFinite(sub.price) && Number(sub.totalCredits) > 0) {
      unitPrice = Number(sub.price) / Number(sub.totalCredits);
    } else if (
      sale &&
      Number.isFinite(sale.price) &&
      sub &&
      Number(sub.totalCredits) > 0
    ) {
      unitPrice = Number(sale.price) / Number(sub.totalCredits);
    }

    const creditsUsed =
      Number.isFinite(tx.creditsUsed) && Number(tx.creditsUsed) > 0
        ? Number(tx.creditsUsed)
        : Array.isArray(booking.seats)
          ? booking.seats.length
          : 0;

    return creditsUsed * unitPrice;
  };

  const bookingsBySessionId = bookings.reduce((accumulator, booking) => {
    const key = booking.sessionId ? booking.sessionId.toString() : "";
    if (!key) {
      return accumulator;
    }

    const current = accumulator.get(key) || [];
    current.push(booking);
    accumulator.set(key, current);
    return accumulator;
  }, new Map());

  const ticketsByBookingId = tickets.reduce((accumulator, ticket) => {
    const key = ticket.bookingId ? ticket.bookingId.toString() : "";
    if (!key) {
      return accumulator;
    }

    const current = accumulator.get(key) || [];
    current.push(ticket);
    accumulator.set(key, current);
    return accumulator;
  }, new Map());

  const bookingsById = new Map(bookings.map((booking) => [booking._id.toString(), booking]));
  const globalPricingColumnsMap = new Map();

  tickets.forEach((ticket) => {
    const bookingKey = ticket.bookingId ? ticket.bookingId.toString() : "";
    const booking = bookingsById.get(bookingKey);
    if (booking && isSubscriptionBooking(booking)) {
      return;
    }

    const pricingName = String(ticket?.pricingName || "Tarif").trim() || "Tarif";
    const price = Number(ticket?.price) || 0;
    const colKey = getPricingColumnKey(pricingName, price);

    const current = globalPricingColumnsMap.get(colKey) || {
      key: colKey,
      pricingName,
      price,
      ticketsSold: 0,
      revenue: 0,
    };

    globalPricingColumnsMap.set(colKey, {
      ...current,
      ticketsSold: current.ticketsSold + 1,
      revenue: current.revenue + price,
    });
  });

  const pricingColumns = Array.from(globalPricingColumnsMap.values()).sort(
    (left, right) => {
      const byCount = right.ticketsSold - left.ticketsSold;
      if (byCount !== 0) {
        return byCount;
      }
      return left.pricingName.localeCompare(right.pricingName, "fr");
    },
  );

  const sessionRows = sortSessionRows(
    sessions.map((session) => {
      const sessionKey = session._id.toString();
      const relatedBookings = bookingsBySessionId.get(sessionKey) || [];
      const regularBookings = relatedBookings.filter(
        (booking) => !isSubscriptionBooking(booking),
      );
      const subscriptionBookings = relatedBookings.filter((booking) =>
        isSubscriptionBooking(booking),
      );

      const relatedRegularTickets = regularBookings.flatMap((booking) => {
        const bookingKey = booking?._id ? booking._id.toString() : "";
        return bookingKey ? ticketsByBookingId.get(bookingKey) || [] : [];
      });

      const pricingCounts = {};
      relatedRegularTickets.forEach((ticket) => {
        const pricingName = String(ticket?.pricingName || "Tarif").trim() || "Tarif";
        const price = Number(ticket?.price) || 0;
        const colKey = getPricingColumnKey(pricingName, price);
        pricingCounts[colKey] = (pricingCounts[colKey] || 0) + 1;
      });

      const pricingBreakdown = buildPricingBreakdown(relatedRegularTickets);

      const regularTicketsSold = regularBookings.reduce(
        (total, booking) =>
          total + (Array.isArray(booking.seats) ? booking.seats.length : 0),
        0,
      );
      const regularRevenue = regularBookings.reduce(
        (total, booking) => total + (Number(booking.totalAmount) || 0),
        0,
      );

      const subscriptionTickets = subscriptionBookings.reduce(
        (total, booking) =>
          total + (Array.isArray(booking.seats) ? booking.seats.length : 0),
        0,
      );
      const subscriptionRevenue = subscriptionBookings.reduce(
        (total, booking) => total + getBookingSubscriptionRevenue(booking),
        0,
      );

      const soldTickets = regularTicketsSold + subscriptionTickets;
      const revenue = regularRevenue + subscriptionRevenue;

      const promotionDiscountAmount = relatedBookings.reduce(
        (total, booking) =>
          total + (Number(booking?.promotion?.discountAmount) || 0),
        0,
      );

      return {
        sessionId: sessionKey,
        eventId:
          session?.eventId && typeof session.eventId === "object"
            ? String(session.eventId._id || "")
            : "",
        eventName:
          session?.eventId && typeof session.eventId === "object"
            ? session.eventId.name || "Événement"
            : "Événement",
        date: session.date || null,
        sessionTime: session.sessionTime || "",
        remainingTickets: Number(session.availableSeats) || 0,
        soldTickets,
        regularTicketsSold,
        pricingCounts,
        pricingBreakdown,
        subscriptionTickets,
        subscriptionRevenue,
        promotionDiscountAmount,
        regularRevenue,
        revenue,
        totalSeats: Number(session.totalSeats) || 0,
        status: session.status || "",
      };
    }),
  );

  const sessionTimeMap = new Map();
  const pricingMap = new Map();
  const saleDayMap = new Map();
  const leadTimeMap = new Map();
  const saleHourMap = new Map();
  const platformMap = new Map();
  const subscriptionMap = new Map();
  const promoMap = new Map();

  const sessionsById = new Map(
    sessions.map((session) => [session._id.toString(), session]),
  );

  sessionRows.forEach((row) => {
    incrementMap(sessionTimeMap, row.sessionTime || "Sans horaire", {
      ticketsSold: row.soldTickets,
      revenue: row.revenue,
      sessionCount: 1,
    });
  });

  bookings.forEach((booking) => {
    const sessionKey = booking.sessionId ? booking.sessionId.toString() : "";
    const session = sessionsById.get(sessionKey);
    const ticketCount = Array.isArray(booking.seats) ? booking.seats.length : 0;
    const isSub = isSubscriptionBooking(booking);
    const revenue = isSub
      ? getBookingSubscriptionRevenue(booking)
      : Number(booking.totalAmount) || 0;
    const bookingDate = new Date(booking.createdAt);
    const bookingDayKey = formatDayKey(bookingDate);
    const bookingHour = Number.isNaN(bookingDate.getTime())
      ? "00:00"
      : `${String(bookingDate.getHours()).padStart(2, "0")}:00`;
    const source = String(booking.bookingSource || "").toLowerCase();
    const platformLabel =
      source === "ticket_office"
        ? "Guichet"
        : "Web";
    const usesPromo = Boolean(booking?.promotion?.code);
    const discountAmount = Number(booking?.promotion?.discountAmount) || 0;

    incrementMap(saleDayMap, bookingDayKey || "Sans date", {
      ticketsSold: ticketCount,
      bookingCount: 1,
      revenue,
    });

    incrementMap(saleHourMap, bookingHour, {
      ticketsSold: ticketCount,
      bookingCount: 1,
      revenue,
    });

    incrementMap(platformMap, platformLabel, {
      ticketsSold: ticketCount,
      bookingCount: 1,
      revenue,
    });

    incrementMap(subscriptionMap, isSub ? "Avec abonnement" : "Sans abonnement", {
      ticketsSold: ticketCount,
      bookingCount: 1,
      revenue,
    });

    incrementMap(promoMap, usesPromo ? "Avec code promo" : "Sans code promo", {
      ticketsSold: ticketCount,
      bookingCount: 1,
      revenue,
      discountAmount,
    });

    if (session) {
      const sessionDay = getSessionDayStart(session.date);
      const bookingDay = getSessionDayStart(booking.createdAt);
      if (sessionDay && bookingDay) {
        const daysBefore = Math.max(
          0,
          Math.round((sessionDay.getTime() - bookingDay.getTime()) / DAY_MS),
        );
        const leadLabel =
          daysBefore === 0
            ? "Jour J"
            : daysBefore === 1
              ? "1 jour avant"
              : `${daysBefore} jours avant`;

        incrementMap(leadTimeMap, leadLabel, {
          ticketsSold: ticketCount,
          bookingCount: 1,
          revenue,
          daysBefore,
        });
      }
    }
  });

  tickets.forEach((ticket) => {
    const bookingKey = ticket.bookingId ? ticket.bookingId.toString() : "";
    const booking = bookingsById.get(bookingKey);
    if (booking && isSubscriptionBooking(booking)) {
      return;
    }

    const pricingName = ticket.pricingName || "Tarif";
    const price = Number(ticket.price) || 0;
    const key = `${pricingName} • ${price.toLocaleString("fr-FR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} DT`;

    incrementMap(pricingMap, key, {
      ticketsSold: 1,
      bookingCount: 0,
      revenue: price,
    });

    const current = pricingMap.get(key);
    pricingMap.set(key, {
      ...current,
      pricingName,
      price,
    });
  });

  const totals = sessionRows.reduce(
    (accumulator, row) => ({
      sessionsCount: accumulator.sessionsCount + 1,
      soldTickets: accumulator.soldTickets + row.soldTickets,
      regularTicketsSold:
        accumulator.regularTicketsSold + (row.regularTicketsSold || 0),
      remainingTickets: accumulator.remainingTickets + row.remainingTickets,
      subscriptionTickets:
        accumulator.subscriptionTickets + row.subscriptionTickets,
      subscriptionRevenue:
        accumulator.subscriptionRevenue + (row.subscriptionRevenue || 0),
      regularRevenue: accumulator.regularRevenue + (row.regularRevenue || 0),
      promotionDiscountAmount:
        accumulator.promotionDiscountAmount + row.promotionDiscountAmount,
      revenue: accumulator.revenue + row.revenue,
      bookingsCount: accumulator.bookingsCount,
    }),
    {
      sessionsCount: 0,
      soldTickets: 0,
      regularTicketsSold: 0,
      remainingTickets: 0,
      subscriptionTickets: 0,
      subscriptionRevenue: 0,
      regularRevenue: 0,
      promotionDiscountAmount: 0,
      revenue: 0,
      bookingsCount: bookings.length,
    },
  );

  return {
    filters: {
      dateStart: dateStart || "",
      dateEnd: dateEnd || "",
      eventId: resolvedEventId,
      sessionTime: resolvedSessionTime,
    },
    availableSessionTimes,
    pricingColumns,
    totals,
    sessionRows,
    charts: {
      sessionTimes: mapToSortedArray(
        sessionTimeMap,
        (left, right) => left.key.localeCompare(right.key),
      ).map((item) => ({
        label: item.key,
        ticketsSold: item.ticketsSold,
        revenue: item.revenue,
        sessionCount: item.sessionCount || 0,
      })),
      pricing: mapToSortedArray(
        pricingMap,
        (left, right) => right.ticketsSold - left.ticketsSold,
      ).map((item) => ({
        label: item.key,
        pricingName: item.pricingName || item.key,
        price: item.price || 0,
        ticketsSold: item.ticketsSold,
        revenue: item.revenue,
      })),
      saleDays: mapToSortedArray(
        saleDayMap,
        (left, right) => left.key.localeCompare(right.key),
      ).map((item) => ({
        label: item.key,
        bookingCount: item.bookingCount,
        ticketsSold: item.ticketsSold,
        revenue: item.revenue,
      })),
      leadTimes: mapToSortedArray(
        leadTimeMap,
        (left, right) => (left.daysBefore || 0) - (right.daysBefore || 0),
      ).map((item) => ({
        label: item.key,
        daysBefore: item.daysBefore || 0,
        bookingCount: item.bookingCount,
        ticketsSold: item.ticketsSold,
        revenue: item.revenue,
      })),
      saleHours: mapToSortedArray(
        saleHourMap,
        (left, right) => left.key.localeCompare(right.key),
      ).map((item) => ({
        label: item.key,
        bookingCount: item.bookingCount,
        ticketsSold: item.ticketsSold,
        revenue: item.revenue,
      })),
      platforms: mapToSortedArray(
        platformMap,
        (left, right) => right.ticketsSold - left.ticketsSold,
      ).map((item) => ({
        label: item.key,
        bookingCount: item.bookingCount,
        ticketsSold: item.ticketsSold,
        revenue: item.revenue,
      })),
      subscriptionUsage: mapToSortedArray(
        subscriptionMap,
        (left, right) => right.ticketsSold - left.ticketsSold,
      ).map((item) => ({
        label: item.key,
        bookingCount: item.bookingCount,
        ticketsSold: item.ticketsSold,
        revenue: item.revenue,
      })),
      promoUsage: mapToSortedArray(
        promoMap,
        (left, right) => right.bookingCount - left.bookingCount,
      ).map((item) => ({
        label: item.key,
        bookingCount: item.bookingCount,
        ticketsSold: item.ticketsSold,
        revenue: item.revenue,
        discountAmount: item.discountAmount || 0,
      })),
    },
  };
};

const buildSessionSalesPdf = async ({
  dateStart,
  dateEnd,
  eventId,
  sessionTime,
}) => {
  const PDFDocument = getPdfKit();
  const statistics = await buildStatistics({
    dateStart,
    dateEnd,
    eventId,
    sessionTime,
  });

  let eventName = "Tous les événements";
  if (statistics.filters.eventId) {
    const event = await Event.findById(statistics.filters.eventId)
      .select("name")
      .lean();
    if (event?.name) {
      eventName = event.name;
    }
  }

  const filters = [
    `Date debut: ${formatDateLabel(statistics.filters.dateStart)}`,
    `Date fin: ${formatDateLabel(statistics.filters.dateEnd)}`,
    `Événement: ${eventName}`,
    `Heure de séance: ${statistics.filters.sessionTime || "Toutes"}`,
  ];
  const pricingSummary = formatPricingSummaryInline(statistics.charts.pricing);

  const title = "Rapport statistiques - ventes par séance";
  const filenameParts = [
    "statistiques-ventes-seances",
    statistics.filters.dateStart || "debut-libre",
    statistics.filters.dateEnd || "fin-libre",
    statistics.filters.eventId ? "event" : "all",
    statistics.filters.sessionTime || "all-times",
  ];
  const filename = `${filenameParts.join("-")}.pdf`;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      layout: "landscape",
      margin: 36,
      info: {
        Title: title,
        Author: "Majestic",
      },
    });

    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () =>
      resolve({
        buffer: Buffer.concat(chunks),
        filename,
      }),
    );

    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const margin = doc.page.margins.left;
    const contentWidth = pageWidth - margin * 2;
    const pricingColumns = Array.isArray(statistics.pricingColumns)
      ? statistics.pricingColumns
      : [];
    const pricingColsCount = pricingColumns.length;
    const columnWidths = computeDynamicColumnWidths(contentWidth, pricingColsCount);
    const tableHeaderHeight = 34;
    const minimumRowHeight = 34;
    const tableLeft = margin;
    const pageBottomLimit = pageHeight - doc.page.margins.bottom;
    const filterLineHeight = 12;
    const filterBoxHeight = Math.max(48, 20 + filters.length * filterLineHeight);
    let cursorY = margin;

    const drawReportHeader = () => {
      cursorY = margin;

      doc
        .fillColor("#1034a6")
        .font("Helvetica-Bold")
        .fontSize(22)
        .text(title, margin, cursorY, {
          width: contentWidth,
        });

      cursorY += 28;

      doc
        .fillColor("#475569")
        .font("Helvetica")
        .fontSize(10)
        .text(`Généré le ${formatDateTimeLabel(new Date())}`, margin, cursorY, {
          width: contentWidth,
        });

      cursorY += 18;

      doc
        .roundedRect(margin, cursorY, contentWidth, filterBoxHeight, 12)
        .fillAndStroke("#f8fafc", "#e2e8f0");
      doc.fillColor("#0f172a").font("Helvetica").fontSize(10);
      filters.forEach((line, index) => {
        doc.text(line, margin + 14, cursorY + 10 + index * filterLineHeight, {
          width: contentWidth - 28,
        });
      });

      cursorY += filterBoxHeight + 16;

      const ticketsSummaryLine = `Séances: ${statistics.totals.sessionsCount}   Billets vendus: ${statistics.totals.soldTickets} (Tarifs: ${statistics.totals.regularTicketsSold || 0} • Abonnements: ${statistics.totals.subscriptionTickets || 0})   Recette totale: ${formatCurrency(statistics.totals.revenue)}`;

      doc
        .fillColor("#0f172a")
        .font("Helvetica-Bold")
        .fontSize(11)
        .text(
          ticketsSummaryLine,
          margin,
          cursorY,
          { width: contentWidth },
        );

      cursorY +=
        doc.heightOfString(ticketsSummaryLine, { width: contentWidth }) + 5;

      if (pricingSummary) {
        doc
          .fillColor("#334155")
          .font("Helvetica")
          .fontSize(9.5)
          .text(`Ventes par tarif: ${pricingSummary}`, margin, cursorY, {
            width: contentWidth,
          });
        cursorY +=
          doc.heightOfString(`Ventes par tarif: ${pricingSummary}`, {
            width: contentWidth,
          }) + 4;
      }

      const subSummaryLine = `Ventes par abonnement: ${statistics.totals.subscriptionTickets || 0} billets (${formatCurrency(statistics.totals.subscriptionRevenue || 0)})   Promotions: ${formatCurrency(statistics.totals.promotionDiscountAmount || 0)}`;
      doc
        .fillColor("#334155")
        .font("Helvetica-Bold")
        .fontSize(9.5)
        .text(subSummaryLine, margin, cursorY, { width: contentWidth });

      cursorY += doc.heightOfString(subSummaryLine, { width: contentWidth }) + 20;
    };

    const startContinuationPage = () => {
      doc.addPage();
      cursorY = margin;
    };

    const drawTableHeader = () => {
      let columnX = tableLeft;
      const headers = [
        "Événement",
        "Séance",
        "Billets vendus",
        ...pricingColumns.map((col) => {
          const priceLabel = formatPricingAmount(col.price);
          return priceLabel ? `${col.pricingName}\n(${priceLabel} DT)` : col.pricingName;
        }),
        "Abonnement\n(billets / recette)",
        "Promotion",
        "Recette totale",
      ];

      doc
        .rect(tableLeft, cursorY, contentWidth, tableHeaderHeight)
        .fill("#1034a6");
      doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(8);

      headers.forEach((label, index) => {
        const isCenter = index >= 2 && index < headers.length - 1;
        const isRight = index === headers.length - 1;
        doc.text(label, columnX + 4, cursorY + 6, {
          width: columnWidths[index] - 8,
          lineGap: 1,
          align: isCenter ? "center" : isRight ? "right" : "left",
        });
        columnX += columnWidths[index];
      });

      cursorY += tableHeaderHeight;
    };

    const ensureRowSpace = (requiredHeight) => {
      if (cursorY + requiredHeight > pageBottomLimit) {
        startContinuationPage();
        drawTableHeader();
      }
    };

    const buildRowValues = (row) => [
      row.eventName || "-",
      `${formatDateLabel(row.date)}${row.sessionTime ? ` • ${row.sessionTime}` : ""}`,
      String(row.soldTickets || 0),
      ...pricingColumns.map((col) => {
        const count = row.pricingCounts?.[col.key] || 0;
        return count > 0 ? String(count) : "-";
      }),
      row.subscriptionTickets > 0 || row.subscriptionRevenue > 0
        ? `${row.subscriptionTickets || 0}\n(${formatCurrency(row.subscriptionRevenue || 0)})`
        : "-",
      row.promotionDiscountAmount > 0 ? formatCurrency(row.promotionDiscountAmount) : "-",
      formatCurrency(row.revenue || 0),
    ];

    const measureRowHeight = (rowValues) => {
      doc.font("Helvetica").fontSize(8.2);

      const textHeight = rowValues.reduce((maxHeight, value, index) => {
        const height = doc.heightOfString(String(value), {
          width: columnWidths[index] - 8,
          lineGap: 1,
        });

        return Math.max(maxHeight, height);
      }, 0);

      return Math.max(minimumRowHeight, textHeight + 16);
    };

    drawReportHeader();
    drawTableHeader();

    if (statistics.sessionRows.length === 0) {
      doc
        .fillColor("#475569")
        .font("Helvetica")
        .fontSize(10)
        .text("Aucune séance pour les filtres choisis.", margin, cursorY + 10);
      doc.end();
      return;
    }

    statistics.sessionRows.forEach((row, rowIndex) => {
      const rowValues = buildRowValues(row);
      const currentRowHeight = measureRowHeight(rowValues);

      ensureRowSpace(currentRowHeight);

      const backgroundColor = rowIndex % 2 === 0 ? "#ffffff" : "#f8fafc";
      let columnX = tableLeft;

      doc
        .rect(tableLeft, cursorY, contentWidth, currentRowHeight)
        .fillAndStroke(backgroundColor, "#e2e8f0");
      doc.fillColor("#0f172a").font("Helvetica").fontSize(8.2);

      rowValues.forEach((value, index) => {
        const isCenter = index >= 2 && index < rowValues.length - 1;
        const isRight = index === rowValues.length - 1;
        doc.text(String(value), columnX + 4, cursorY + 8, {
          width: columnWidths[index] - 8,
          height: currentRowHeight - 16,
          lineGap: 1,
          align: isCenter ? "center" : isRight ? "right" : "left",
          ellipsis: true,
        });
        columnX += columnWidths[index];
      });

      cursorY += currentRowHeight;
    });

    doc.end();
  });
};

module.exports = {
  buildStatistics,
  buildSessionSalesPdf,
};
