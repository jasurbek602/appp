const router = require("express").Router();
const User = require("../models/User");
const { requireAuth } = require("../middleware/auth");
const { upload, saveBufferToGridFS, streamFromGridFS, deleteFromGridFS } = require("../middleware/upload");
const { publicBase } = require("../utils/publicUrl");

// GET /api/users/me
router.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// PATCH /api/users/me  { fullName, theme, publicKey }
router.patch("/me", requireAuth, async (req, res) => {
  const { fullName, theme, publicKey } = req.body;
  const update = {};
  if (fullName !== undefined) update.fullName = fullName.slice(0, 50);
  if (theme && ["dark", "light"].includes(theme)) update.theme = theme;
  if (publicKey !== undefined) update.publicKey = publicKey;

  const user = await User.findByIdAndUpdate(req.user._id, update, { new: true }).select(
    "-passwordHash -secretKeyHash"
  );
  res.json({ user });
});

// POST /api/users/me/avatar  (multipart/form-data, field: avatar)
router.post("/me/avatar", requireAuth, upload.single("avatar"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Rasm yuborilmadi" });
    if (!req.file.mimetype.startsWith("image/")) {
      return res.status(400).json({ error: "Faqat rasm fayllari qabul qilinadi" });
    }

    const user = await User.findById(req.user._id);
    // Eski avatarni o'chiramiz - bazani keraksiz fayllar bilan to'ldirmaslik uchun
    if (user.avatarFileId) await deleteFromGridFS(user.avatarFileId);

    const fileId = await saveBufferToGridFS(
      req.file.buffer,
      `avatar_${req.user._id}_${Date.now()}`,
      req.file.mimetype
    );
    user.avatarFileId = fileId;
    await user.save();

    res.json({ avatarUrl: `${publicBase(req)}/api/media/${fileId}` });
  } catch (err) {
    res.status(500).json({ error: "Avatar yuklashda xatolik" });
  }
});

// GET /api/users/search?q=username
router.get("/search", requireAuth, async (req, res) => {
  const q = (req.query.q || "").trim().toLowerCase();
  if (q.length < 2) return res.json({ users: [] });

  const users = await User.find({
    username: { $regex: "^" + q, $options: "i" },
    _id: { $ne: req.user._id },
  })
    .select("username fullName avatarFileId isOnline")
    .limit(20);

  res.json({ users });
});

module.exports = router;
