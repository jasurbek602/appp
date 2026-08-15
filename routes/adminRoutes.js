const router = require("express").Router();
const { requireAuth, requireAdmin } = require("../middleware/auth");
const Chat = require("../models/Chat");
const Message = require("../models/Message");
const User = require("../models/User");
const { decryptChatKey, decryptMessage } = require("../utils/encryption");
const { publicBase } = require("../utils/publicUrl");

router.use(requireAuth, requireAdmin);

// GET /api/admin/stats - umumiy statistika
router.get("/stats", async (req, res) => {
  const [userCount, chatCount, messageCount, mediaCount] = await Promise.all([
    User.countDocuments(),
    Chat.countDocuments(),
    Message.countDocuments(),
    Message.countDocuments({ type: { $ne: "text" } }),
  ]);
  res.json({ userCount, chatCount, messageCount, mediaCount });
});

// GET /api/admin/users
router.get("/users", async (req, res) => {
  const users = await User.find().select("-passwordHash -secretKeyHash").sort({ createdAt: -1 });
  res.json({ users });
});

// PATCH /api/admin/users/:id/ban  { isBanned }
router.patch("/users/:id/ban", async (req, res) => {
  const user = await User.findByIdAndUpdate(
    req.params.id,
    { isBanned: !!req.body.isBanned },
    { new: true }
  ).select("-passwordHash -secretKeyHash");
  res.json({ user });
});

// GET /api/admin/chats - barcha aktiv chatlar
router.get("/chats", async (req, res) => {
  const chats = await Chat.find()
    .populate("participants", "username fullName")
    .sort({ lastMessageAt: -1 });
  res.json({ chats });
});

// GET /api/admin/chats/:id/messages - shu chatdagi barcha xabarlarni deshifrlab ko'rsatish
// ESLATMA: Bu funksiya loyihaning 7-bandidagi "admin nazorati" talabini bajaradi.
// Bu shuni anglatadiki, chat to'liq E2EE emas (yuqorida utils/encryption.js
// izohida tushuntirilgan) - admin server-side kalit orqali xabarlarni o'qiy oladi.
// Bu funksiyaga faqat role === "admin" kira oladi va har bir kirish
// log qilinishi tavsiya etiladi (masalan AuditLog kolleksiyasi qo'shib).
router.get("/chats/:id/messages", async (req, res) => {
  const chat = await Chat.findById(req.params.id);
  if (!chat) return res.status(404).json({ error: "Chat topilmadi" });

  const chatKey = decryptChatKey(chat.encryptedChatKey);
  const messages = await Message.find({ chat: chat._id }).sort({ createdAt: 1 });

  const result = messages.map((m) => ({
    id: m._id,
    sender: m.sender,
    type: m.type,
    text: m.type === "text" ? decryptMessage(m.cipherText, chatKey) : undefined,
    media: m.type !== "text" ? { url: `${publicBase(req)}/api/media/${m.media.fileId}`, mimeType: m.media.mimeType } : undefined,
    createdAt: m.createdAt,
  }));

  res.json({ messages: result });
});

module.exports = router;
