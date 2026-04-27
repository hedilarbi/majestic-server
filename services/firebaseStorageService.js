const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const admin = require("firebase-admin");
require("firebase-admin/storage");

const DEFAULT_BUCKET = "majestic-83244.firebasestorage.app";

const normalizeBucketName = (bucket) => {
  if (!bucket) {
    return "";
  }

  return bucket.replace(/^gs:\/\//, "");
};

const loadCredentials = () => {
  const raw = process.env.FIREBASE_CREDENTIALS;
  if (!raw) {
    const error = new Error("FIREBASE_CREDENTIALS is not set");
    error.status = 500;
    throw error;
  }

  const trimmed = raw.trim();

  if (trimmed.startsWith("{")) {
    return JSON.parse(trimmed);
  }

  if (trimmed.startsWith("base64:")) {
    const decoded = Buffer.from(trimmed.slice(7), "base64").toString("utf8");
    return JSON.parse(decoded);
  }

  const possiblePath = path.isAbsolute(trimmed)
    ? trimmed
    : path.join(process.cwd(), trimmed);
  if (fs.existsSync(possiblePath)) {
    const fileContents = fs.readFileSync(possiblePath, "utf8");
    return JSON.parse(fileContents);
  }

  try {
    const decoded = Buffer.from(trimmed, "base64").toString("utf8");
    return JSON.parse(decoded);
  } catch (error) {
    const parseError = new Error(
      "Invalid FIREBASE_CREDENTIALS format; expected JSON, base64 JSON, or a file path"
    );
    parseError.status = 500;
    throw parseError;
  }
};

const getFirebaseApp = () => {
  if (admin.apps.length > 0) {
    return admin.app();
  }

  const bucketName = normalizeBucketName(
    process.env.FIREBASE_STORAGE_BUCKET || DEFAULT_BUCKET
  );

  return admin.initializeApp({
    credential: admin.credential.cert(loadCredentials()),
    storageBucket: bucketName,
  });
};

const getBucket = () => {
  const app = getFirebaseApp();
  return app.storage().bucket();
};

const getNamedBucket = (bucketName) => {
  const safeBucketName = normalizeBucketName(bucketName);
  if (!safeBucketName) {
    return getBucket();
  }

  const app = getFirebaseApp();
  return app.storage().bucket(safeBucketName);
};

const randomToken = () => {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return crypto.randomBytes(16).toString("hex");
};

const uploadImage = async (file, { folder = "uploads" } = {}) => {
  if (!file || !file.buffer) {
    const error = new Error("Image file is required");
    error.status = 400;
    throw error;
  }

  if (!file.mimetype || !file.mimetype.startsWith("image/")) {
    const error = new Error("Only image files are allowed");
    error.status = 400;
    throw error;
  }

  const bucket = getBucket();
  const extension = path.extname(file.originalname || "").toLowerCase();
  const safeExtension = extension && extension.length <= 10 ? extension : "";
  const fileName = `${folder}/${Date.now()}-${crypto
    .randomBytes(6)
    .toString("hex")}${safeExtension}`;

  const token = randomToken();

  await bucket.file(fileName).save(file.buffer, {
    resumable: false,
    metadata: {
      contentType: file.mimetype,
      metadata: {
        firebaseStorageDownloadTokens: token,
      },
    },
  });

  const encodedPath = encodeURIComponent(fileName);
  const bucketName = bucket.name;
  const url = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodedPath}?alt=media&token=${token}`;

  return {
    url,
    path: fileName,
    bucket: bucketName,
  };
};

const parseFirebaseStorageUrl = (value) => {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) {
    return null;
  }

  if (raw.startsWith("gs://")) {
    const withoutPrefix = raw.slice(5);
    const firstSlashIndex = withoutPrefix.indexOf("/");
    if (firstSlashIndex <= 0) {
      return null;
    }

    return {
      bucket: normalizeBucketName(withoutPrefix.slice(0, firstSlashIndex)),
      path: decodeURIComponent(withoutPrefix.slice(firstSlashIndex + 1)),
    };
  }

  let parsed;

  try {
    parsed = new URL(raw);
  } catch (_error) {
    return null;
  }

  const hostname = parsed.hostname.toLowerCase();

  if (hostname === "firebasestorage.googleapis.com") {
    const match = parsed.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/);
    if (!match) {
      return null;
    }

    return {
      bucket: normalizeBucketName(match[1]),
      path: decodeURIComponent(match[2]),
    };
  }

  if (hostname === "storage.googleapis.com") {
    const match = parsed.pathname.match(/^\/([^/]+)\/(.+)$/);
    if (!match) {
      return null;
    }

    return {
      bucket: normalizeBucketName(match[1]),
      path: decodeURIComponent(match[2]),
    };
  }

  return null;
};

const deleteImageByUrl = async (value) => {
  const parsed = parseFirebaseStorageUrl(value);
  if (!parsed?.bucket || !parsed?.path) {
    return { deleted: false, skipped: true, reason: "non_firebase_url" };
  }

  const bucket = getNamedBucket(parsed.bucket);

  try {
    await bucket.file(parsed.path).delete({ ignoreNotFound: true });
    return {
      deleted: true,
      bucket: parsed.bucket,
      path: parsed.path,
    };
  } catch (error) {
    error.status = error.status || 500;
    throw error;
  }
};

module.exports = {
  deleteImageByUrl,
  uploadImage,
};
