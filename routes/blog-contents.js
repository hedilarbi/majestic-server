const express = require("express");
const mongoose = require("mongoose");
const multer = require("multer");

const BlogContent = require("../models/BlogContent");
const {
  createBlogContent,
  deleteBlogContent,
  getBlogContent,
  getPublicBlogContent,
  listBlogContents,
  listPublicBlogContents,
  updateBlogContent,
} = require("../controllers/blogContentController");
const { hasDashboardPermission } = require("../config/dashboardPermissions");
const { authenticate } = require("../middlewares/auth");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });
const BLOG_PERMISSION_MODULES_BY_TYPE = {
  article: "blog_articles",
  trailer: "blog_videos",
  form: "blog_forms",
};
const BLOG_CONTENT_TYPES = Object.keys(BLOG_PERMISSION_MODULES_BY_TYPE);

const normalizeBlogContentType = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  return BLOG_CONTENT_TYPES.includes(normalized) ? normalized : "";
};

const hasFullBlogAccess = (user) =>
  user?.role === "blog_manager" || user?.role === "super_admin";

const hasBlogTypePermission = (user, type, action) => {
  const moduleKey = BLOG_PERMISSION_MODULES_BY_TYPE[type];
  return Boolean(moduleKey && hasDashboardPermission(user, moduleKey, action));
};

const getAllowedBlogTypes = (user, action) =>
  BLOG_CONTENT_TYPES.filter((type) => hasBlogTypePermission(user, type, action));

const authenticateBlogUser = (req, res, next) =>
  authenticate(req, res, () => {
    const role = req.user?.role;

    if (hasFullBlogAccess(req.user) || role === "admin") {
      return next();
    }

    return res.status(403).json({ message: "Accès refuse" });
  });

const requireBlogListAccess = (req, res, next) =>
  authenticateBlogUser(req, res, () => {
    if (hasFullBlogAccess(req.user)) {
      return next();
    }

    const requestedType = normalizeBlogContentType(req.query?.type);
    if (req.query?.type && !requestedType) {
      return res.status(400).json({ message: "Type de contenu invalide." });
    }

    if (requestedType) {
      if (hasBlogTypePermission(req.user, requestedType, "list")) {
        return next();
      }
      return res.status(403).json({ message: "Accès refuse" });
    }

    const allowedTypes = getAllowedBlogTypes(req.user, "list");
    if (!allowedTypes.length) {
      return res.status(403).json({ message: "Accès refuse" });
    }

    req.allowedBlogContentTypes = allowedTypes;
    return next();
  });

const resolveExistingBlogContent = async (req, res, next) => {
  const id = req.params.id;

  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: "Contenu invalide." });
  }

  const item = await BlogContent.findById(id).select("type").lean();
  if (!item) {
    return res.status(404).json({ message: "Contenu introuvable." });
  }

  req.blogContentType = item.type;
  return next();
};

const requireExistingBlogTypeAccess = (action) => (req, res, next) => {
  if (hasFullBlogAccess(req.user)) {
    return next();
  }

  const existingType = normalizeBlogContentType(req.blogContentType);
  const payloadType = normalizeBlogContentType(req.body?.type);
  const typesToCheck = new Set([existingType]);

  if (payloadType) {
    typesToCheck.add(payloadType);
  }

  const allowed = Array.from(typesToCheck).every((type) =>
    hasBlogTypePermission(req.user, type, action)
  );

  if (allowed) {
    return next();
  }

  return res.status(403).json({ message: "Accès refuse" });
};

const requirePayloadBlogTypeAccess = (action) => (req, res, next) => {
  if (hasFullBlogAccess(req.user)) {
    return next();
  }

  const type = normalizeBlogContentType(req.body?.type);
  if (!type) {
    return res.status(400).json({ message: "Type de contenu invalide." });
  }

  if (hasBlogTypePermission(req.user, type, action)) {
    return next();
  }

  return res.status(403).json({ message: "Accès refuse" });
};

router.get("/public", listPublicBlogContents);
router.get("/public/:slug", getPublicBlogContent);
router.get("/", requireBlogListAccess, listBlogContents);
router.get(
  "/:id",
  authenticateBlogUser,
  resolveExistingBlogContent,
  requireExistingBlogTypeAccess("list"),
  getBlogContent,
);
router.post(
  "/",
  authenticateBlogUser,
  upload.fields([
    { name: "image", maxCount: 1 },
    { name: "thumbnail", maxCount: 1 },
    { name: "images", maxCount: 10 },
  ]),
  requirePayloadBlogTypeAccess("create"),
  createBlogContent,
);
router.put(
  "/:id",
  authenticateBlogUser,
  resolveExistingBlogContent,
  upload.fields([
    { name: "image", maxCount: 1 },
    { name: "thumbnail", maxCount: 1 },
    { name: "images", maxCount: 10 },
  ]),
  requireExistingBlogTypeAccess("update"),
  updateBlogContent,
);
router.delete(
  "/:id",
  authenticateBlogUser,
  resolveExistingBlogContent,
  requireExistingBlogTypeAccess("delete"),
  deleteBlogContent,
);

module.exports = router;
