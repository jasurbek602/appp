const router = require("express").Router();
const { requireAuth } = require("../middleware/auth");
const Chat = require("../models/Chat");
const Message = require("../models/Message");
const { decryptChatKey, encryptMessage, decryptMessage } = require("../utils/encryption");
const { upload, saveBufferToGridFS } = require("../middleware/upload");
const { publicBase } = require("../utils/publicUrl");

async function getChatAndKey(chatId, userId) {
  const chat = await Chat.findById(chatId);
  if (!chat) return { error: "Chat topilmadi", status: 404 };
  if (!chat.participants.some((p) => p.equals(userId))) {
    return { error: "Ruxsat yo'q", status: 403 };
  }
  const chatKey = decryptChatKey(chat.encryptedChatKey);
  return { chat, chatKey };
}

function serializeMessage(msg, chatKey, base) {
  const out = {
    id: msg._id,
    chat: msg.chat,
    sender: msg.sender,
    type: msg.type,
    seenBy: msg.seenBy,
    createdAt: msg.createdAt,
    updatedAt: msg.updatedAt,
    isEdited: !!msg.isEdited,
    isDeleted: !!msg.isDeleted,
  };
  if (out.isDeleted) return out; // o'chirilgan xabarning matni/mediasi hech qachon qaytarilmaydi
  if (msg.type === "text") {
    out.text = decryptMessage(msg.cipherText, chatKey);
  } else {
    out.media = {
      url: `${base}/api/media/${msg.media.fileId}`,
      mimeType: msg.media.mimeType,
      sizeBytes: msg.media.sizeBytes,
      durationSec: msg.media.durationSec,
      pitchShift: msg.media.pitchShift,
    };
  }
  return out;
}

// ---------- MATNLI XABAR ----------
// POST /api/messages/:chatId/text  { text }
router.post("/:chatId/text", requireAuth, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: "Matn bo'sh bo'lishi mumkin emas" });
    if (text.length > 4000) return res.status(400).json({ error: "Xabar juda uzun" });

    const { chat, chatKey, error, status } = await getChatAndKey(req.params.chatId, req.user._id);
    if (error) return res.status(status).json({ error });

    const cipherText = encryptMessage(text, chatKey);
    const message = await Message.create({
      chat: chat._id,
      sender: req.user._id,
      type: "text",
      cipherText,
      deliveredTo: [req.user._id],
    });

    chat.lastMessageAt = new Date();
    chat.lastMessagePreview = "Yangi xabar"; // shifrlangan matnni ochiq saqlamaymiz
    await chat.save();

    res.status(201).json({ message: serializeMessage(message, chatKey, publicBase(req)) });
  } catch (err) {
    res.status(500).json({ error: "Xabar yuborishda xatolik" });
  }
});

// ---------- MEDIA XABAR (audio / image / video) ----------
// POST /api/messages/:chatId/media  (multipart/form-data: file, type, pitchShift, durationSec)
router.post("/:chatId/media", requireAuth, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Fayl yuborilmadi" });

    const { chat, error, status } = await getChatAndKey(req.params.chatId, req.user._id);
    if (error) return res.status(status).json({ error });

    const type = ["audio", "image", "video"].includes(req.body.type) ? req.body.type : "image";

    const fileId = await saveBufferToGridFS(
      req.file.buffer,
      `${type}_${chat._id}_${Date.now()}`,
      req.file.mimetype
    );

    const message = await Message.create({
      chat: chat._id,
      sender: req.user._id,
      type,
      media: {
        fileId,
        mimeType: req.file.mimetype,
        sizeBytes: req.file.size,
        durationSec: Number(req.body.durationSec) || undefined,
        // Frontendda Web Audio API orqali ovoz allaqachon o'zgartirilgan
        // holda yozib olinadi; bu maydon faqat qaysi effekt qo'llanilgani haqidagi metama'lumot
        pitchShift: Number(req.body.pitchShift) || 0,
      },
      deliveredTo: [req.user._id],
    });

    chat.lastMessageAt = new Date();
    chat.lastMessagePreview = type === "audio" ? "🎤 Ovozli xabar" : type === "video" ? "🎥 Video" : "🖼 Rasm";
    await chat.save();

    res.status(201).json({ message: serializeMessage(message, null, publicBase(req)) });
  } catch (err) {
    res.status(500).json({ error: "Media yuborishda xatolik" });
  }
});

// ---------- TARIXNI OLISH ----------
// GET /api/messages/:chatId?limit=50&before=<messageId>
router.get("/:chatId", requireAuth, async (req, res) => {
  const { chat, chatKey, error, status } = await getChatAndKey(req.params.chatId, req.user._id);
  if (error) return res.status(status).json({ error });

  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const query = { chat: chat._id, isDeleted: { $ne: true } };
  if (req.query.before) {
    const beforeMsg = await Message.findById(req.query.before);
    if (beforeMsg) query.createdAt = { $lt: beforeMsg.createdAt };
  }

  const messages = await Message.find(query).sort({ createdAt: -1 }).limit(limit);
  res.json({ messages: messages.reverse().map((m) => serializeMessage(m, chatKey, publicBase(req))) });
});

// ---------- POLLING ENDPOINT (real-time o'rniga) ----------
// GET /api/messages/:chatId/poll?since=<ISO timestamp>
// Frontend har N millisekundda shu endpointni chaqirib, "since" dan keyingi
// yangi xabarlarni oladi. Vercel serverless muhitida doimiy Socket.io
// ulanishi barqaror ishlamagani uchun bu yondashuv tanlandi (server.js
// tepasidagi izohga qarang).
router.get("/:chatId/poll", requireAuth, async (req, res) => {
  const { chat, chatKey, error, status } = await getChatAndKey(req.params.chatId, req.user._id);
  if (error) return res.status(status).json({ error });

  const since = req.query.since ? new Date(req.query.since) : new Date(0);

  // updatedAt bo'yicha: shu orqali YANGI xabarlar bilan bir qatorda,
  // eskiroq xabarlarning tahrirlangani/o'chirilgani/"O'qildi" holati
  // yangilangani ham ikkala tomonga darhol yetib boradi.
  const messages = await Message.find({
    chat: chat._id,
    updatedAt: { $gt: since },
  }).sort({ updatedAt: 1 });

  res.json({
    messages: messages.map((m) => serializeMessage(m, chatKey, publicBase(req))),
    serverTime: new Date().toISOString(), // frontend keyingi "since" sifatida shuni ishlatadi
  });
});

// ---------- SEEN (O'QILDI) BELGISI ----------
// POST /api/messages/:chatId/seen
// Sharpa (stealthRead) yoqilgan bo'lsa, seenBy massiviga umuman yozilmaydi.
router.post("/:chatId/seen", requireAuth, async (req, res) => {
  const { chat, error, status } = await getChatAndKey(req.params.chatId, req.user._id);
  if (error) return res.status(status).json({ error });

  const mySettings = chat.settings.get(req.user._id.toString()) || {};
  if (mySettings.stealthRead) {
    // 👻 Sharpa rejimi: o'qiganini bildirmaymiz, lekin "delivered" holatini yangilashimiz mumkin
    return res.json({ ok: true, stealth: true });
  }

  await Message.updateMany(
    { chat: chat._id, sender: { $ne: req.user._id }, seenBy: { $ne: req.user._id } },
    { $addToSet: { seenBy: req.user._id } }
  );

  res.json({ ok: true, stealth: false });
});

// ---------- XABARNI TAHRIRLASH ----------
// PATCH /api/messages/:chatId/:messageId  { text }
// Faqat matn turidagi, faqat o'zi yuborgan, o'chirilmagan xabarni tahrirlash mumkin.
router.patch("/:chatId/:messageId", requireAuth, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: "Matn bo'sh bo'lishi mumkin emas" });
    if (text.length > 4000) return res.status(400).json({ error: "Xabar juda uzun" });

    const { chatKey, error, status } = await getChatAndKey(req.params.chatId, req.user._id);
    if (error) return res.status(status).json({ error });

    const message = await Message.findOne({ _id: req.params.messageId, chat: req.params.chatId });
    if (!message) return res.status(404).json({ error: "Xabar topilmadi" });
    if (!message.sender.equals(req.user._id)) {
      return res.status(403).json({ error: "Faqat o'z xabaringizni tahrirlay olasiz" });
    }
    if (message.isDeleted) return res.status(409).json({ error: "O'chirilgan xabarni tahrirlab bo'lmaydi" });
    if (message.type !== "text") return res.status(400).json({ error: "Faqat matnli xabarni tahrirlash mumkin" });

    message.cipherText = encryptMessage(text, chatKey);
    message.isEdited = true;
    await message.save();

    res.json({ message: serializeMessage(message, chatKey, publicBase(req)) });
  } catch (err) {
    res.status(500).json({ error: "Tahrirlashda xatolik" });
  }
});

// ---------- XABARNI O'CHIRISH (ikkala tomondan ham darhol) ----------
// DELETE /api/messages/:chatId/:messageId
// Kontent (matn/media) darhol tozalanadi va bazadan olib tashlanadi;
// faqat "o'chirilgan" degan belgi (tombstone) qoladi - shu orqali
// ikkinchi tomonning keyingi poll so'rovi xabar o'chganini bilib,
// uni o'z ekranidan ham darhol olib tashlaydi. Tombstone 24 soatdan
// keyin (expiresAt TTL) bazadan avtomatik butunlay o'chadi.
router.delete("/:chatId/:messageId", requireAuth, async (req, res) => {
  try {
    const { error, status } = await getChatAndKey(req.params.chatId, req.user._id);
    if (error) return res.status(status).json({ error });

    const message = await Message.findOne({ _id: req.params.messageId, chat: req.params.chatId });
    if (!message) return res.status(404).json({ error: "Xabar topilmadi" });
    if (!message.sender.equals(req.user._id)) {
      return res.status(403).json({ error: "Faqat o'z xabaringizni o'chira olasiz" });
    }

    if (message.media?.fileId) {
      await deleteFromGridFS(message.media.fileId);
      message.media = undefined;
    }
    message.cipherText = undefined;
    message.isDeleted = true;
    message.isEdited = false;
    message.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await message.save();

    res.json({ ok: true, id: message._id });
  } catch (err) {
    res.status(500).json({ error: "O'chirishda xatolik" });
  }
});

module.exports = router;
