const mongoose = require("mongoose");
const Partner = require("../models/Partner");
const { uploadImage } = require("../services/firebaseStorageService");

const normalizeImageAspect = (value) =>
  value === "vertical" ? "vertical" : "horizontal";

const listPublicPartners = async (_req, res) => {
  try {
    const partners = await Partner.find({ isActive: true }).sort({ order: 1, createdAt: -1 });
    return res.status(200).json({ partners });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Server error" });
  }
};

const listPartners = async (_req, res) => {
  try {
    const partners = await Partner.find().sort({ order: 1, createdAt: -1 });
    return res.status(200).json({ partners });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Server error" });
  }
};

const createPartner = async (req, res) => {
  try {
    const { name, order, isActive, imageAspect } = req.body || {};
    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: "Le nom est obligatoire." });
    }
    let image = "";
    if (req.file) {
      const upload = await uploadImage(req.file, { folder: "partners" });
      image = upload.url;
    }
    const partner = await Partner.create({
      name: String(name).trim(),
      image,
      imageAspect: normalizeImageAspect(imageAspect),
      order: Number.isFinite(Number(order)) ? Number(order) : 0,
      isActive: isActive !== false && isActive !== "false",
    });
    return res.status(201).json({ partner });
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message || "Server error" });
  }
};

const updatePartner = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "ID invalide." });
    }
    const updates = {};
    if (req.body?.name !== undefined) updates.name = String(req.body.name).trim();
    if (req.body?.order !== undefined) updates.order = Number(req.body.order);
    if (req.body?.imageAspect !== undefined) updates.imageAspect = normalizeImageAspect(req.body.imageAspect);
    if (req.body?.isActive !== undefined) updates.isActive = req.body.isActive !== false && req.body.isActive !== "false";
    if (req.file) {
      const upload = await uploadImage(req.file, { folder: "partners" });
      updates.image = upload.url;
    }
    const partner = await Partner.findByIdAndUpdate(id, updates, { new: true, runValidators: true });
    if (!partner) return res.status(404).json({ message: "Partenaire introuvable." });
    return res.status(200).json({ partner });
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message || "Server error" });
  }
};

const deletePartner = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "ID invalide." });
    }
    const partner = await Partner.findByIdAndDelete(id);
    if (!partner) return res.status(404).json({ message: "Partenaire introuvable." });
    return res.status(200).json({ partner });
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message || "Server error" });
  }
};

module.exports = { listPublicPartners, listPartners, createPartner, updatePartner, deletePartner };
