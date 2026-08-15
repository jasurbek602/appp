const router = require("express").Router();
const mongoose = require("mongoose");
const { requireAuth } = require("../middleware/auth");
const ChatRequest = require("../models/ChatRequest");
const Chat = require("../models/Chat");
const Message = require("../models/Message");
const User = require("../models/User");
const { generateChatKey, encryptChatKey } = require("../utils/encryption");
const { deleteFromGridFS } = require("../middleware/upload");

// ---------- 1) CHAT SO'ROVI YUBORISH ----------
// POST /api/chats/request  { toUsername, ghostMode }
router.post("/request", requireAuth, async (req, res) => {
  try {
    const { toUsername, ghostMode } = req.body;
    const toUser = await User.findOne({ username: (toUsername || "").toLowerCase() });
    if (!toUser) return res.status(404).json({ error: "Foydalanuvchi topilmadi" });
    if (toUser._id.equals(req.user._id)) {
      return res.status(400).json({ error: "O'zingizga so'rov yubora olmaysiz" });
    }

    const existing = await ChatRequest.findOne({
      from: req.user._id,
      to: toUser._id,
      status: "pending",
    });
    if (existing) return res.status(409).json({ error: "So'rov allaqachon yuborilgan" });

    const request = await ChatRequest.create({
      from: req.user._id,
      to: toUser._id,
      isGhostRequest: !!ghostMode,
    });

    res.status(201).json({ request });
  } catch (err) {
    res.status(500).json({ error: "So'rov yuborishda xatolik" });
  }
});

// GET /api/chats/requests  - menga kelgan pending so'rovlar
router.get("/requests", requireAuth, async (req, res) => {
  const requests = await ChatRequest.find({ to: req.user._id, status: "pending" })
    .populate("from", "username fullName avatarFileId")
    .sort({ createdAt: -1 });
  res.json({ requests });
});

// ---------- 2) SO'ROVNI QABUL / RAD QILISH ----------
// POST /api/chats/requests/:id/respond  { action: "accept" | "reject" }
router.post("/requests/:id/respond", requireAuth, async (req, res) => {
  try {
    const { action } = req.body;
    const request = await ChatRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ error: "So'rov topilmadi" });
    if (!request.to.equals(req.user._id)) {
      return res.status(403).json({ error: "Bu so'rov sizga tegishli emas" });
    }
    if (request.status !== "pending") {
      return res.status(409).json({ error: "So'rov allaqachon javob berilgan" });
    }

    if (action === "reject") {
      request.status = "rejected";
      await request.save();
      return res.json({ ok: true, status: "rejected" });
    }

    if (action !== "accept") return res.status(400).json({ error: "Noto'g'ri action" });

    request.status = "accepted";
    await request.save();

    // Chat kaliti generatsiya qilinadi va master key bilan shifrlanib saqlanadi
    const chatKey = generateChatKey();
    const chat = await Chat.create({
      participants: [request.from, request.to],
      encryptedChatKey: encryptChatKey(chatKey),
    });

    res.json({
      ok: true,
      status: "accepted",
      chat,
      // Frontend ghost-mode logikasi uchun: agar so'rov ghost bo'lsa,
      // faqat SO'ROV YUBORGAN tomon buni o'z localStorage'ida "ghost chat"
      // sifatida belgilaydi (bu javob faqat qabul qiluvchiga qaytadi,
      // ghost belgisi yuboruvchining o'zida ijro etiladi - pastdagi
      // GET /api/chats/requests/sent orqali frontend buni tekshiradi).
      isGhostRequest: request.isGhostRequest,
    });
  } catch (err) {
    res.status(500).json({ error: "Javob berishda xatolik" });
  }
});

// GET /api/chats/requests/sent - men yuborgan so'rovlar (ghost holatini frontend shu yerdan biladi)
router.get("/requests/sent", requireAuth, async (req, res) => {
  const requests = await ChatRequest.find({ from: req.user._id })
    .populate("to", "username fullName avatarFileId")
    .sort({ createdAt: -1 });
  res.json({ requests });
});

// ---------- 3) CHATLAR RO'YXATI ----------
// GET /api/chats
// Eslatma: Ghost chatlar bu ro'yxatda UMUMAN qaytarilmaydi - chunki ular
// backendda oddiy Chat sifatida ko'rinsa ham, frontend ularni faqat
// localStorage'da "yashiringan" deb belgilangan holatda ko'rsatadi/yashiradi.
// Haqiqiy "faqat shu qurilmada ko'rinish" logikasi to'liq frontendda ishlaydi (public/js/ghost.js).
router.get("/", requireAuth, async (req, res) => {
  const chats = await Chat.find({
    participants: req.user._id,
    isFullyDeleted: false,
    [`settings.${req.user._id}.isDeletedFor`]: { $ne: true },
  })
    .populate("participants", "username fullName avatarFileId isOnline lastSeen")
    .sort({ lastMessageAt: -1 });

  res.json({ chats });
});

// PATCH /api/chats/:id/settings  { screenshotBlock, stealthRead }
router.patch("/:id/settings", requireAuth, async (req, res) => {
  const chat = await Chat.findById(req.params.id);
  if (!chat) return res.status(404).json({ error: "Chat topilmadi" });
  if (!chat.participants.some((p) => p.equals(req.user._id))) {
    return res.status(403).json({ error: "Ruxsat yo'q" });
  }

  const key = req.user._id.toString();
  const current = chat.settings.get(key) || {};
  const { screenshotBlock, stealthRead } = req.body;

  if (screenshotBlock !== undefined) current.screenshotBlock = !!screenshotBlock;
  if (stealthRead !== undefined) current.stealthRead = !!stealthRead;

  chat.settings.set(key, current);
  await chat.save();
  res.json({ ok: true, settings: current });
});

// ---------- 4) CHATNI QAYTARIB BO'LMAYDIGAN DARAJADA O'CHIRISH ----------
// DELETE /api/chats/:id
// Talab: "bir taraf chatni o'chirsa, xabar va media fayllar ikki tarafdan
// ham, MongoDB bazasidan ham to'liq o'chirilsin" - shuning uchun bu HARD
// DELETE, soft-delete emas. Birinchi taraf o'chirganda darhol butunlay o'chadi.
router.delete("/:id", requireAuth, async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const chat = await Chat.findById(req.params.id);
    if (!chat) return res.status(404).json({ error: "Chat topilmadi" });
    if (!chat.participants.some((p) => p.equals(req.user._id))) {
      return res.status(403).json({ error: "Ruxsat yo'q" });
    }

    // 1) Shu chatga tegishli barcha xabarlarni topamiz, media fayllarni GridFS'dan o'chiramiz
    const messages = await Message.find({ chat: chat._id });
    for (const msg of messages) {
      if (msg.media?.fileId) {
        await deleteFromGridFS(msg.media.fileId);
      }
    }

    // 2) Xabarlarni bazadan butunlay o'chiramiz (qaytarib bo'lmaydi)
    await Message.deleteMany({ chat: chat._id });

    // 3) Chat hujjatining o'zini ham o'chiramiz
    await Chat.findByIdAndDelete(chat._id);

    res.json({ ok: true, message: "Chat va barcha ma'lumotlar butunlay o'chirildi" });
  } catch (err) {
    res.status(500).json({ error: "O'chirishda xatolik" });
  } finally {
    session.endSession();
  }
});

module.exports = router;
