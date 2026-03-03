const reservationService = require("../services/reservationService");

const getReservationForSession = async (req, res) => {
  try {
    const result = await reservationService.getReservationForSession({
      sessionId: req.params.sessionId,
      userId: req.user && req.user.sub,
    });
    return res.status(200).json(result);
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
  }
};

const createReservation = async (req, res) => {
  try {
    const reservation = await reservationService.createReservation({
      payload: req.body || {},
      userId: req.user && req.user.sub,
      io: req.io,
    });
    return res.status(201).json({ reservation });
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
  }
};

const cancelReservation = async (req, res) => {
  try {
    const result = await reservationService.cancelReservation({
      reservationId: req.params.reservationId,
      userId: req.user && req.user.sub,
      io: req.io,
    });
    return res.status(200).json(result);
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
  }
};

const cancelReservationsForSession = async (req, res) => {
  try {
    const result = await reservationService.cancelReservationsForSession({
      sessionId: req.params.sessionId,
      userId: req.user && req.user.sub,
      io: req.io,
    });
    return res.status(200).json(result);
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
  }
};

module.exports = {
  createReservation,
  cancelReservation,
  getReservationForSession,
  cancelReservationsForSession,
};
