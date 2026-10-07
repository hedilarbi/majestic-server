// One-off migration: fill `seat.number` (aisles not counted) on tickets,
// bookings and tarif corrections created before seat numbers existed.
//
// Usage:
//   node scripts/backfill-seat-numbers.js           # dry run, prints counts
//   node scripts/backfill-seat-numbers.js --apply   # writes to the database
require("dotenv").config();

const mongoose = require("mongoose");

const Booking = require("../models/Booking");
const Session = require("../models/Session");
const TarifCorrection = require("../models/TarifCorrection");
const Ticket = require("../models/Ticket");
const { resolveRoom } = require("../utils/seatHelpers");
const { buildSeatNumberMap, getSeatNumber } = require("../utils/seatNumbers");

const APPLY = process.argv.includes("--apply");

const seatNumberMapBySession = new Map();

const getSeatNumberMapForSession = async (sessionId) => {
  const key = String(sessionId);
  if (seatNumberMapBySession.has(key)) {
    return seatNumberMapBySession.get(key);
  }

  const session = await Session.findById(sessionId).select("roomId").lean();
  const room = session ? await resolveRoom(session.roomId) : null;
  const map = room ? buildSeatNumberMap(room.layout) : null;
  seatNumberMapBySession.set(key, map);
  return map;
};

const backfillTickets = async () => {
  const ops = [];
  let missing = 0;
  const cursor = Ticket.find({}).select("sessionId seat").lean().cursor();

  for await (const ticket of cursor) {
    const map = await getSeatNumberMapForSession(ticket.sessionId);
    const number = map ? getSeatNumber(map, ticket.seat) : null;
    if (!number) {
      missing += 1;
      continue;
    }
    if (ticket.seat?.number === number) {
      continue;
    }
    ops.push({
      updateOne: {
        filter: { _id: ticket._id },
        update: { $set: { "seat.number": number } },
      },
    });
  }

  return { ops, missing };
};

const backfillBookings = async () => {
  const ops = [];
  let missing = 0;
  const cursor = Booking.find({}).select("sessionId seats").lean().cursor();

  for await (const booking of cursor) {
    const map = await getSeatNumberMapForSession(booking.sessionId);
    if (!map || !Array.isArray(booking.seats)) {
      missing += 1;
      continue;
    }
    let changed = false;
    const seats = booking.seats.map((seat) => {
      const number = getSeatNumber(map, seat);
      if (number && seat.number !== number) {
        changed = true;
      }
      return { ...seat, number: number ?? seat.number };
    });
    if (changed) {
      ops.push({
        updateOne: {
          filter: { _id: booking._id },
          update: { $set: { seats } },
        },
      });
    }
  }

  return { ops, missing };
};

const backfillTarifCorrections = async () => {
  const ops = [];
  let missing = 0;
  const cursor = TarifCorrection.find({})
    .select("ticketId seat")
    .lean()
    .cursor();

  for await (const correction of cursor) {
    const ticket = correction.ticketId
      ? await Ticket.findById(correction.ticketId).select("sessionId").lean()
      : null;
    const map = ticket ? await getSeatNumberMapForSession(ticket.sessionId) : null;
    const number = map ? getSeatNumber(map, correction.seat) : null;
    if (!number) {
      missing += 1;
      continue;
    }
    if (correction.seat?.number === number) {
      continue;
    }
    ops.push({
      updateOne: {
        filter: { _id: correction._id },
        update: { $set: { "seat.number": number } },
      },
    });
  }

  return { ops, missing };
};

const run = async () => {
  await mongoose.connect(process.env.DB_CONNECTION);

  const results = {
    tickets: [Ticket, await backfillTickets()],
    bookings: [Booking, await backfillBookings()],
    tarifCorrections: [TarifCorrection, await backfillTarifCorrections()],
  };

  for (const [name, [Model, { ops, missing }]] of Object.entries(results)) {
    console.log(
      `${name}: ${ops.length} to update, ${missing} without a matching room seat`
    );
    if (APPLY && ops.length > 0) {
      const res = await Model.bulkWrite(ops, { ordered: false });
      console.log(`  -> ${res.modifiedCount} updated`);
    }
  }

  if (!APPLY) {
    console.log("\nDry run only. Re-run with --apply to write the changes.");
  }

  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
