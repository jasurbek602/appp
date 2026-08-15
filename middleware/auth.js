const jwt = require("jsonwebtoken");
const User = require("../models/User");

async function requireAuth(req, res, next) {
  try {
    const token =
      req.cookies?.token ||
      (req.headers.authorization?.startsWith("Bearer ")
        ? req.headers.authorization.split(" ")[1]
        : null);

    if (!token) return res.status(401).json({ error: "Tizimga kirilmagan" });

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.id).select("-passwordHash -secretKeyHash");
    if (!user || user.isBanned) {
      return res.status(401).json({ error: "Foydalanuvchi topilmadi yoki bloklangan" });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Token yaroqsiz yoki muddati o'tgan" });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "Faqat admin uchun ruxsat" });
  }
  next();
}

module.exports = { requireAuth, requireAdmin };
