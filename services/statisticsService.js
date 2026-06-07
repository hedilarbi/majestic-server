const mongoose = require("mongoose");

const Booking = require("../models/Booking");
const Event = require("../models/Event");
const Session = require("../models/Session");
const Ticket = require("../models/Ticket");

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
    };

    pricingMap.set(key, {
      ...current,
      ticketsSold: current.ticketsSold + 1,
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
      totals: {
        sessionsCount: 0,
        soldTickets: 0,
        remainingTickets: 0,
        subscriptionTickets: 0,
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

  const sessionRows = sortSessionRows(
    sessions.map((session) => {
      const sessionKey = session._id.toString();
      const relatedBookings = bookingsBySessionId.get(sessionKey) || [];
      const relatedTickets = relatedBookings.flatMap((booking) => {
        const bookingKey = booking?._id ? booking._id.toString() : "";
        return bookingKey ? ticketsByBookingId.get(bookingKey) || [] : [];
      });
      const soldTickets = relatedBookings.reduce(
        (total, booking) =>
          total + (Array.isArray(booking.seats) ? booking.seats.length : 0),
        0,
      );
      const revenue = relatedBookings.reduce(
        (total, booking) => total + (Number(booking.totalAmount) || 0),
        0,
      );
      const subscriptionTickets = relatedBookings.reduce((total, booking) => {
        const usesSubscription =
          booking.paymentMethod === "subscription" ||
          Boolean(booking?.subscriptionTransaction?.subscriptionCode);

        if (!usesSubscription) {
          return total;
        }

        return (
          total + (Array.isArray(booking.seats) ? booking.seats.length : 0)
        );
      }, 0);
      const promotionDiscountAmount = relatedBookings.reduce(
        (total, booking) =>
          total + (Number(booking?.promotion?.discountAmount) || 0),
        0,
      );
      const pricingBreakdown = buildPricingBreakdown(relatedTickets);

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
        pricingBreakdown,
        subscriptionTickets,
        promotionDiscountAmount,
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
    const revenue = Number(booking.totalAmount) || 0;
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
    const usesSubscription =
      booking.paymentMethod === "subscription" ||
      Boolean(booking?.subscriptionTransaction?.subscriptionCode);
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

    incrementMap(subscriptionMap, usesSubscription ? "Avec abonnement" : "Sans abonnement", {
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
      remainingTickets: accumulator.remainingTickets + row.remainingTickets,
      subscriptionTickets:
        accumulator.subscriptionTickets + row.subscriptionTickets,
      promotionDiscountAmount:
        accumulator.promotionDiscountAmount + row.promotionDiscountAmount,
      revenue: accumulator.revenue + row.revenue,
      bookingsCount: accumulator.bookingsCount,
    }),
    {
      sessionsCount: 0,
      soldTickets: 0,
      remainingTickets: 0,
      subscriptionTickets: 0,
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
    const columnWidths = [
      contentWidth * 0.22,
      contentWidth * 0.13,
      contentWidth * 0.08,
      contentWidth * 0.24,
      contentWidth * 0.1,
      contentWidth * 0.11,
      contentWidth * 0.12,
    ];
    const tableHeaderHeight = 30;
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

      const ticketsSummaryLine = `Séances: ${statistics.totals.sessionsCount}   Billets vendus: ${statistics.totals.soldTickets}${pricingSummary ? ` (${pricingSummary})` : ""}   Recette: ${formatCurrency(statistics.totals.revenue)}`;

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

      doc
        .fillColor("#0f172a")
        .font("Helvetica-Bold")
        .fontSize(10)
        .text(
          `Billets abonnement: ${statistics.totals.subscriptionTickets || 0}   Promotions: ${formatCurrency(statistics.totals.promotionDiscountAmount || 0)}`,
          margin,
          cursorY,
          { width: contentWidth },
        );

      cursorY += 28;
    };

    const startContinuationPage = () => {
      doc.addPage();
      cursorY = margin;
    };

    const drawTableHeader = () => {
      let columnX = tableLeft;

      doc
        .rect(tableLeft, cursorY, contentWidth, tableHeaderHeight)
        .fill("#1034a6");
      doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(8.5);

      [
        "Événement",
        "Séance",
        "Billets vendus",
        "Par tarif",
        "Abonnement",
        "Promotion",
        "Recette",
      ].forEach((label, index) => {
        doc.text(label, columnX + 6, cursorY + 8, {
          width: columnWidths[index] - 12,
          lineGap: 1,
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
      formatPricingBreakdownLabel(row.pricingBreakdown),
      String(row.subscriptionTickets || 0),
      formatCurrency(row.promotionDiscountAmount || 0),
      formatCurrency(row.revenue || 0),
    ];

    const measureRowHeight = (rowValues) => {
      doc.font("Helvetica").fontSize(8.2);

      const textHeight = rowValues.reduce((maxHeight, value, index) => {
        const height = doc.heightOfString(String(value), {
          width: columnWidths[index] - 12,
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
        doc.text(value, columnX + 6, cursorY + 8, {
          width: columnWidths[index] - 12,
          height: currentRowHeight - 16,
          lineGap: 1,
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
