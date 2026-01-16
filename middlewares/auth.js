const jwt = require("jsonwebtoken");

const authenticate = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || "";
    const bearerToken = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : authHeader.trim();
    const token = bearerToken || req.headers["x-access-token"];

    if (!token) {
      return res.status(401).json({ message: "Missing token" });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return res.status(500).json({ message: "JWT_SECRET is not set" });
    }

    const payload = jwt.verify(token, secret);
    req.user = payload;

    return next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid token" });
  }
};

const requireAdmin = (req, res, next) => {
  return authenticate(req, res, () => {
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }

    return next();
  });
};

module.exports = {
  authenticate,
  requireAdmin,
};
