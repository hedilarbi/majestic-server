const jwt = require("jsonwebtoken");

const extractToken = (req) => {
  const authHeader = req.headers.authorization || "";
  const bearerToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : authHeader.trim();
  return bearerToken || req.headers["x-access-token"] || "";
};

const authenticate = (req, res, next) => {
  try {
    const token = extractToken(req);

    if (!token) {
      return res.status(401).json({ message: "Token manquant" });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return res.status(500).json({ message: "JWT_SECRET n'est pas defini" });
    }

    const payload = jwt.verify(token, secret);
    req.user = payload;

    return next();
  } catch (error) {
    return res.status(401).json({ message: "Token invalide" });
  }
};

const optionalAuthenticate = (req, _res, next) => {
  try {
    const token = extractToken(req);
    if (!token) {
      req.user = null;
      return next();
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      req.user = null;
      return next();
    }

    const payload = jwt.verify(token, secret);
    req.user = payload;
    return next();
  } catch (_error) {
    req.user = null;
    return next();
  }
};

const requireAdmin = (req, res, next) => {
  return authenticate(req, res, () => {
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({ message: "Acces admin requis" });
    }

    return next();
  });
};

module.exports = {
  authenticate,
  optionalAuthenticate,
  requireAdmin,
};
