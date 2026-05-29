const express = require("express");
const multer = require("multer");

const {
  createBlogContent,
  deleteBlogContent,
  getBlogContent,
  getPublicBlogContent,
  listBlogContents,
  listPublicBlogContents,
  updateBlogContent,
} = require("../controllers/blogContentController");
const { requireStaffRoles } = require("../middlewares/auth");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });
const requireBlogAccess = requireStaffRoles(["blog_manager", "super_admin"]);

router.get("/public", listPublicBlogContents);
router.get("/public/:slug", getPublicBlogContent);
router.get("/", requireBlogAccess, listBlogContents);
router.get("/:id", requireBlogAccess, getBlogContent);
router.post(
  "/",
  requireBlogAccess,
  upload.fields([
    { name: "image", maxCount: 1 },
    { name: "thumbnail", maxCount: 1 },
    { name: "images", maxCount: 10 },
  ]),
  createBlogContent,
);
router.put(
  "/:id",
  requireBlogAccess,
  upload.fields([
    { name: "image", maxCount: 1 },
    { name: "thumbnail", maxCount: 1 },
    { name: "images", maxCount: 10 },
  ]),
  updateBlogContent,
);
router.delete("/:id", requireBlogAccess, deleteBlogContent);

module.exports = router;
