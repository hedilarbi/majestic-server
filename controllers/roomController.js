const roomService = require("../services/roomService");

const createRoom = async (req, res) => {
  try {
    const room = await roomService.createRoom(req.body || {});
    return res.status(201).json({ room });
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
  }
};

const listRooms = async (req, res) => {
  try {
    const rooms = await roomService.listRooms();
    return res.status(200).json(rooms);
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
  }
};

const getRoom = async (req, res) => {
  try {
    const room = await roomService.getRoomById(req.params.id);
    return res.status(200).json({ room });
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
  }
};

const updateRoom = async (req, res) => {
  try {
    const room = await roomService.updateRoom(req.params.id, req.body || {});
    return res.status(200).json({ room });
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
  }
};

const deleteRoom = async (req, res) => {
  try {
    const room = await roomService.deleteRoom(req.params.id);
    return res.status(200).json({ room });
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ message: error.message || "Server error" });
  }
};

module.exports = {
  createRoom,
  listRooms,
  getRoom,
  updateRoom,
  deleteRoom,
};
