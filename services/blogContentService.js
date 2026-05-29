const mongoose = require("mongoose");

const BlogContent = require("../models/BlogContent");
const {
  deleteImageByUrl,
  uploadImage,
} = require("./firebaseStorageService");

const OPTION_BASED_TYPES = new Set(["radio", "checkbox", "select"]);

const normalizeString = (value) => {
  if (typeof value !== "string") {
    return value;
  }

  return value.trim();
};

const normalizeBoolean = (value) => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const lowered = value.trim().toLowerCase();
    if (lowered === "true") {
      return true;
    }
    if (lowered === "false") {
      return false;
    }
  }

  return Boolean(value);
};

const normalizeEnumValue = (value) => {
  if (typeof value !== "string") {
    return value;
  }

  return value.trim().toLowerCase();
};

const parseArray = (value) => {
  if (Array.isArray(value)) {
    return value;
  }

  if (value === undefined || value === null || value === "") {
    return [];
  }

  if (typeof value !== "string") {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
};

const slugify = (value) => {
  const source = normalizeString(value) || "contenu";

  return source
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "contenu";
};

const ensureUniqueSlug = async (baseSlug, excludeId = null) => {
  const safeBase = slugify(baseSlug);
  let suffix = 0;

  while (true) {
    const candidate = suffix === 0 ? safeBase : `${safeBase}-${suffix + 1}`;
    const existing = await BlogContent.findOne({
      slug: candidate,
      ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    })
      .select("_id")
      .lean();

    if (!existing) {
      return candidate;
    }

    suffix += 1;
  }
};

const normalizeQuestion = (question, index) => {
  if (!question || typeof question !== "object") {
    const error = new Error(`Question ${index + 1} invalide.`);
    error.status = 400;
    throw error;
  }

  const type = normalizeEnumValue(question.type);
  const label = normalizeString(question.label);

  if (!label) {
    const error = new Error(`Le libelle de la question ${index + 1} est obligatoire.`);
    error.status = 400;
    throw error;
  }

  const allowedTypes = [
    "text",
    "textarea",
    "email",
    "number",
    "radio",
    "checkbox",
    "select",
  ];

  if (!allowedTypes.includes(type)) {
    const error = new Error(`Le type de la question ${index + 1} est invalide.`);
    error.status = 400;
    throw error;
  }

  const options = parseArray(question.options)
    .map((option) => normalizeString(option))
    .filter(Boolean);

  if (OPTION_BASED_TYPES.has(type) && options.length < 2) {
    const error = new Error(
      `La question ${index + 1} doit contenir au moins deux options.`,
    );
    error.status = 400;
    throw error;
  }

  return {
    label,
    type,
    required: normalizeBoolean(question.required),
    placeholder: normalizeString(question.placeholder) || "",
    helpText: normalizeString(question.helpText) || "",
    options: OPTION_BASED_TYPES.has(type) ? options : [],
  };
};

const normalizeQuestions = (value) => {
  const questions = parseArray(value);
  return questions.map((question, index) => normalizeQuestion(question, index));
};

const assertObjectId = (value, fieldName) => {
  if (!value) {
    const error = new Error(`${fieldName} manquant.`);
    error.status = 400;
    throw error;
  }

  if (!mongoose.isValidObjectId(value)) {
    const error = new Error(`${fieldName} invalide.`);
    error.status = 400;
    throw error;
  }
};

const buildPayload = async ({ payload = {}, files = {}, actorId, existing = null }) => {
  assertObjectId(actorId, "Utilisateur");

  const type = normalizeEnumValue(payload.type ?? existing?.type);
  const title = normalizeString(payload.title);
  const excerpt = normalizeString(payload.excerpt);
  const isPublished = Object.prototype.hasOwnProperty.call(payload, "isPublished")
    ? normalizeBoolean(payload.isPublished)
    : existing?.isPublished ?? true;

  const data = {
    ...(existing ? {} : { createdBy: actorId }),
    updatedBy: actorId,
    type,
    isPublished,
  };

  if (!type || !["article", "trailer", "form"].includes(type)) {
    const error = new Error("Type de contenu invalide.");
    error.status = 400;
    throw error;
  }

  if (title !== undefined) {
    data.title = title;
  } else if (!existing) {
    const error = new Error("Le titre est obligatoire.");
    error.status = 400;
    throw error;
  }

  if (excerpt !== undefined) {
    data.excerpt = excerpt;
  }

  // SEO metadata — applies to all content types
  const seoTitle = normalizeString(payload.seoTitle);
  const seoDescription = normalizeString(payload.seoDescription);
  if (seoTitle !== undefined) {
    data.seoTitle = seoTitle || "";
  }
  if (seoDescription !== undefined) {
    data.seoDescription = seoDescription || "";
  }

  const fileImage = files?.image?.[0];
  const fileThumbnail = files?.thumbnail?.[0];
  const fileImages = files?.images || [];

  if (type === "article") {
    if (Object.prototype.hasOwnProperty.call(payload, "contentHtml")) {
      data.contentHtml = payload.contentHtml || "";
    } else if (!existing) {
      data.contentHtml = "";
    }

    if (fileImage) {
      const upload = await uploadImage(fileImage, { folder: "blog/articles" });
      data.image = upload.url;
    } else if (Object.prototype.hasOwnProperty.call(payload, "image")) {
      data.image = normalizeString(payload.image) || "";
    }

    if (!existing && !data.image) {
      const error = new Error("L'image de l'article est obligatoire.");
      error.status = 400;
      throw error;
    }

    if (!(data.image || existing?.image)) {
      const error = new Error("L'image de l'article est obligatoire.");
      error.status = 400;
      throw error;
    }

    if (fileImages.length > 0) {
      const uploadedUrls = await Promise.all(
        fileImages.map((file) => uploadImage(file, { folder: "blog/articles/album" }).then((u) => u.url)),
      );
      const existingImages = Object.prototype.hasOwnProperty.call(payload, "images")
        ? parseArray(payload.images)
        : existing?.images || [];
      data.images = [...existingImages, ...uploadedUrls];
    } else if (Object.prototype.hasOwnProperty.call(payload, "images")) {
      data.images = parseArray(payload.images);
    }
  }

  if (type === "trailer") {
    if (Object.prototype.hasOwnProperty.call(payload, "videoUrl")) {
      data.videoUrl = normalizeString(payload.videoUrl) || "";
    }

    if (fileThumbnail) {
      const upload = await uploadImage(fileThumbnail, {
        folder: "blog/trailers",
      });
      data.thumbnail = upload.url;
    } else if (Object.prototype.hasOwnProperty.call(payload, "thumbnail")) {
      data.thumbnail = normalizeString(payload.thumbnail) || "";
    }

    if (!(data.videoUrl || existing?.videoUrl)) {
      const error = new Error("L'URL de la bande-annonce est obligatoire.");
      error.status = 400;
      throw error;
    }

    if (!(data.thumbnail || existing?.thumbnail)) {
      const error = new Error("La miniature de la bande-annonce est obligatoire.");
      error.status = 400;
      throw error;
    }
  }

  if (type === "form") {
    if (Object.prototype.hasOwnProperty.call(payload, "formDescription")) {
      data.formDescription = normalizeString(payload.formDescription) || "";
    }

    const questions = normalizeQuestions(
      Object.prototype.hasOwnProperty.call(payload, "questions")
        ? payload.questions
        : existing?.questions || [],
    );

    if (!questions.length) {
      const error = new Error("Ajoutez au moins une question au formulaire.");
      error.status = 400;
      throw error;
    }

    data.questions = questions;
  }

  if (type === "trailer") {
    data.image = "";
    data.images = [];
    data.contentHtml = "";
  }

  if (type === "form") {
    data.images = [];
    data.contentHtml = "";
    if (fileImage) {
      const upload = await uploadImage(fileImage, { folder: "blog/forms" });
      data.image = upload.url;
    } else if (Object.prototype.hasOwnProperty.call(payload, "image")) {
      data.image = normalizeString(payload.image) || "";
    }
  }

  if (type !== "trailer") {
    data.videoUrl = "";
    data.thumbnail = "";
  }

  if (type !== "form") {
    data.formDescription = "";
    data.questions = [];
  }

  const nextTitle = data.title || existing?.title;
  data.slug = await ensureUniqueSlug(nextTitle, existing?._id?.toString() || null);

  return data;
};

const collectStaleAssetUrls = (existing, nextData) => {
  const staleUrls = [];

  const pairs = [
    [normalizeString(existing?.image) || "", normalizeString(nextData?.image) || ""],
    [
      normalizeString(existing?.thumbnail) || "",
      normalizeString(nextData?.thumbnail) || "",
    ],
  ];

  pairs.forEach(([previousUrl, nextUrl]) => {
    if (previousUrl && previousUrl !== nextUrl) {
      staleUrls.push(previousUrl);
    }
  });

  const nextImages = new Set(nextData?.images || []);
  (existing?.images || []).forEach((url) => {
    if (url && !nextImages.has(url)) {
      staleUrls.push(url);
    }
  });

  return Array.from(new Set(staleUrls));
};

const deleteAssetUrls = async (urls = []) => {
  for (const url of urls) {
    if (!url) {
      continue;
    }

    await deleteImageByUrl(url);
  }
};

const listBlogContents = async ({ type, search, isPublished } = {}) => {
  const filters = {};

  if (type) {
    filters.type = normalizeEnumValue(type);
  }

  if (typeof isPublished !== "undefined") {
    filters.isPublished = normalizeBoolean(isPublished);
  }

  const safeSearch = normalizeString(search);
  if (safeSearch) {
    filters.title = new RegExp(
      safeSearch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "i",
    );
  }

  return BlogContent.find(filters)
    .populate("createdBy", "firstName lastName email")
    .populate("updatedBy", "firstName lastName email")
    .sort({ createdAt: -1, _id: -1 });
};

const listPublishedBlogContents = async ({ type, limit } = {}) => {
  const filters = {
    isPublished: true,
  };

  if (type) {
    filters.type = normalizeEnumValue(type);
  }

  const query = BlogContent.find(filters)
    .sort({ createdAt: -1, _id: -1 })
    .populate("createdBy", "firstName lastName");

  const parsedLimit = Number(limit);
  if (Number.isFinite(parsedLimit) && parsedLimit > 0) {
    query.limit(Math.min(parsedLimit, 50));
  }

  return query;
};

const getBlogContentById = async (id) => {
  assertObjectId(id, "Contenu");

  const item = await BlogContent.findById(id)
    .populate("createdBy", "firstName lastName email")
    .populate("updatedBy", "firstName lastName email");

  if (!item) {
    const error = new Error("Contenu introuvable.");
    error.status = 404;
    throw error;
  }

  return item;
};

const getPublishedBlogContentBySlug = async (slug) => {
  const safeSlug = normalizeString(slug);

  if (!safeSlug) {
    const error = new Error("Contenu introuvable.");
    error.status = 404;
    throw error;
  }

  const item = await BlogContent.findOne({
    slug: safeSlug,
    isPublished: true,
  }).populate("createdBy", "firstName lastName");

  if (!item) {
    const error = new Error("Contenu introuvable.");
    error.status = 404;
    throw error;
  }

  return item;
};

const createBlogContent = async ({ payload, files, actorId }) => {
  const data = await buildPayload({ payload, files, actorId });
  return BlogContent.create(data);
};

const updateBlogContent = async (id, { payload, files, actorId }) => {
  const existing = await getBlogContentById(id);
  const data = await buildPayload({
    payload,
    files,
    actorId,
    existing,
  });
  const staleAssetUrls = collectStaleAssetUrls(existing, data);

  Object.assign(existing, data);
  await existing.save();
  await deleteAssetUrls(staleAssetUrls);
  return existing;
};

const deleteBlogContent = async (id) => {
  assertObjectId(id, "Contenu");

  const item = await BlogContent.findById(id);

  if (!item) {
    const error = new Error("Contenu introuvable.");
    error.status = 404;
    throw error;
  }

  await deleteAssetUrls([item.image, item.thumbnail, ...(item.images || [])]);
  await item.deleteOne();

  return item;
};

module.exports = {
  createBlogContent,
  deleteBlogContent,
  getBlogContentById,
  getPublishedBlogContentBySlug,
  listBlogContents,
  listPublishedBlogContents,
  updateBlogContent,
};
