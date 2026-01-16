const firebaseStorageService = require("../services/firebaseStorageService");

const uploadImage = async (req, res) => {
  try {
    const result = await firebaseStorageService.uploadImage(req.file);
    return res.status(201).json({ url: result.url });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ message: error.message || "Server error" });
  }
};

module.exports = {
  uploadImage,
};
