const router = require("express").Router();
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const User = require("../models/User");

// Bruteforce hujumlardan himoya: login/parol tiklashga 15 daqiqada 10 urinish
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Juda ko'p urinish. Keyinroq qayta urinib ko'ring." },
});

function signToken(user) {
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
}

function setAuthCookie(res, token) {
  res.cookie("token", token, {
    httpOnly: true,
    secure: true, // Vercel HTTPS bo'lgani uchun har doim true
    // "none": ilova (Capacitor) o'zining lokal manzilidan backend'ga
    // so'rov yuborganda bu boshqa "origin" hisoblanadi - shu holatda
    // cookie faqat SameSite=None (+ Secure) bo'lganda yuboriladi.
    // Veb-saytning o'zida ham bu xavfsiz, chunki cookie httpOnly va
    // Secure bo'lib qoladi.
    sameSite: "none",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

// POST /api/auth/register
router.post("/register", authLimiter, async (req, res) => {
  try {
    const { username, password, secretKey, fullName } = req.body;

    if (!username || !password || !secretKey) {
      return res.status(400).json({ error: "Username, parol va xavfsizlik kalit so'zi majburiy" });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "Parol kamida 8 belgidan iborat bo'lishi kerak" });
    }
    if (secretKey.length < 6) {
      return res.status(400).json({ error: "Xavfsizlik kalit so'zi kamida 6 belgidan iborat bo'lishi kerak" });
    }

    const exists = await User.findOne({ username: username.toLowerCase() });
    if (exists) return res.status(409).json({ error: "Bu username band" });

    const passwordHash = await User.hashValue(password);
    const secretKeyHash = await User.hashValue(secretKey);

    const user = await User.create({
      username: username.toLowerCase(),
      fullName: fullName || "",
      passwordHash,
      secretKeyHash,
    });

    const token = signToken(user);
    setAuthCookie(res, token);
    res.status(201).json({
      user: { id: user._id, username: user.username, fullName: user.fullName, role: user.role },
    });
  } catch (err) {
    res.status(500).json({ error: "Ro'yxatdan o'tishda xatolik" });
  }
});

// POST /api/auth/login
router.post("/login", authLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username: (username || "").toLowerCase() });
    if (!user) return res.status(401).json({ error: "Username yoki parol noto'g'ri" });
    if (user.isBanned) return res.status(403).json({ error: "Hisobingiz bloklangan" });

    const ok = await user.comparePassword(password || "");
    if (!ok) return res.status(401).json({ error: "Username yoki parol noto'g'ri" });

    user.isOnline = true;
    user.lastSeen = new Date();
    await user.save();

    const token = signToken(user);
    setAuthCookie(res, token);
    res.json({
      user: { id: user._id, username: user.username, fullName: user.fullName, role: user.role, theme: user.theme },
    });
  } catch (err) {
    res.status(500).json({ error: "Kirishda xatolik" });
  }
});

// POST /api/auth/logout
router.post("/logout", (req, res) => {
  // clearCookie'da ham xuddi o'rnatilgandagi kabi sameSite/secure
  // atributlari berilishi kerak - aks holda ba'zi brauzerlarda
  // cookie to'g'ri o'chmasligi mumkin.
  res.clearCookie("token", { httpOnly: true, secure: true, sameSite: "none" });
  res.json({ ok: true });
});

// POST /api/auth/forgot-password/verify  { username, secretKey }
// Xavfsizlik kalit so'zini tekshiradi, to'g'ri bo'lsa qisqa muddatli "reset token" beradi
router.post("/forgot-password/verify", authLimiter, async (req, res) => {
  try {
    const { username, secretKey } = req.body;
    const user = await User.findOne({ username: (username || "").toLowerCase() });
    if (!user) return res.status(404).json({ error: "Foydalanuvchi topilmadi" });

    const ok = await user.compareSecretKey(secretKey || "");
    if (!ok) return res.status(401).json({ error: "Xavfsizlik kalit so'zi noto'g'ri" });

    const resetToken = jwt.sign({ id: user._id, purpose: "reset" }, process.env.JWT_SECRET, {
      expiresIn: "10m",
    });
    res.json({ resetToken });
  } catch (err) {
    res.status(500).json({ error: "Tekshirishda xatolik" });
  }
});

// POST /api/auth/forgot-password/reset { resetToken, newPassword }
router.post("/forgot-password/reset", authLimiter, async (req, res) => {
  try {
    const { resetToken, newPassword } = req.body;
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: "Yangi parol kamida 8 belgidan iborat bo'lishi kerak" });
    }
    const payload = jwt.verify(resetToken, process.env.JWT_SECRET);
    if (payload.purpose !== "reset") throw new Error("noto'g'ri token turi");

    const user = await User.findById(payload.id);
    if (!user) return res.status(404).json({ error: "Foydalanuvchi topilmadi" });

    user.passwordHash = await User.hashValue(newPassword);
    await user.save();

    res.json({ ok: true, message: "Parol muvaffaqiyatli yangilandi" });
  } catch (err) {
    res.status(401).json({ error: "Reset token yaroqsiz yoki muddati o'tgan" });
  }
});

module.exports = router;
