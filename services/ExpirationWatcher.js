const SeatReservation = require("../models/SeatReservation");
const SeatLock = require("../models/SeatLock");

// TTL MongoDB n'est pas instantané; ce watcher assure un feedback temps réel.
const startExpirationWatcher = ({ io, intervalMs = 10000 } = {}) => {
  let running = false;
  const timer = setInterval(async () => {
    if (running) {
      return;
    }
    running = true;

    try {
      const now = new Date();
      const expiredReservations = await SeatReservation.find({
        status: "pending",
        expiresAt: { $lte: now },
      });

      for (const reservation of expiredReservations) {
        const seats = reservation.seats || [];

        if (seats.length > 0) {
          await SeatLock.deleteMany({
            sessionId: reservation.sessionId,
            $or: seats.map((seat) => ({ row: seat.row, col: seat.col })),
          });
        }

        await SeatReservation.deleteOne({ _id: reservation._id });

        if (io) {
          io.to(`session-${reservation.sessionId}`).emit("seats-released", {
            seats,
            userId: reservation.userId ? String(reservation.userId) : null,
            reason: "expired",
            reservation: null,
          });
        }
      }
    } catch (error) {
      console.error("ExpirationWatcher error:", error);
    } finally {
      running = false;
    }
  }, intervalMs);

  if (typeof timer.unref === "function") {
    timer.unref();
  }

  return {
    stop: () => clearInterval(timer),
  };
};

module.exports = { startExpirationWatcher };
