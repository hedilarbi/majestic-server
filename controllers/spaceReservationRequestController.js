const spaceReservationRequestService = require("../services/spaceReservationRequestService");

const createSpaceReservationRequest = async (req, res) => {
  try {
    const item = await spaceReservationRequestService.createSpaceReservationRequest(
      req.body || {},
      { io: req.io },
    );
    return res.status(201).json({ item });
  } catch (error) {
    return res
      .status(error.status || 500)
      .json({ message: error.message || "Server error" });
  }
};

const listSpaceReservationRequests = async (req, res) => {
  try {
    const items = await spaceReservationRequestService.listSpaceReservationRequests(
      req.query || {},
    );
    return res.status(200).json({ items });
  } catch (error) {
    return res
      .status(error.status || 500)
      .json({ message: error.message || "Server error" });
  }
};

const getSpaceReservationRequest = async (req, res) => {
  try {
    const item = await spaceReservationRequestService.getSpaceReservationRequestById(
      req.params.id,
    );
    return res.status(200).json({ item });
  } catch (error) {
    return res
      .status(error.status || 500)
      .json({ message: error.message || "Server error" });
  }
};

const markSpaceReservationRequestProcessed = async (req, res) => {
  try {
    const item =
      await spaceReservationRequestService.markSpaceReservationRequestProcessed(
        req.params.id,
        req.user?.sub,
      );
    return res.status(200).json({ item });
  } catch (error) {
    return res
      .status(error.status || 500)
      .json({ message: error.message || "Server error" });
  }
};

const deleteSpaceReservationRequest = async (req, res) => {
  try {
    const item = await spaceReservationRequestService.deleteSpaceReservationRequest(
      req.params.id,
    );
    return res.status(200).json({ item });
  } catch (error) {
    return res
      .status(error.status || 500)
      .json({ message: error.message || "Server error" });
  }
};

const replyToSpaceReservationRequest = async (req, res) => {
  try {
    const result = await spaceReservationRequestService.replyToSpaceReservationRequest(
      req.params.id,
      { subject: req.body?.subject, message: req.body?.message },
    );
    return res.status(200).json(result);
  } catch (error) {
    return res
      .status(error.status || 500)
      .json({ message: error.message || "Server error" });
  }
};

module.exports = {
  createSpaceReservationRequest,
  deleteSpaceReservationRequest,
  getSpaceReservationRequest,
  listSpaceReservationRequests,
  markSpaceReservationRequestProcessed,
  replyToSpaceReservationRequest,
};
