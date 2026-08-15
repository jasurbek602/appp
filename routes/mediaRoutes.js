const router = require("express").Router();
const { requireAuth } = require("../middleware/auth");
const { streamFromGridFS } = require("../middleware/upload");
const Message = require("../models/Message");
const Chat = require("../models/Chat");

// GET /api/media/:fileId
// Faqat shu media biriktirilgan chatning ishtirokchisi (yoki admin) ko'ra oladi.
router.get("/:fileId", requireAuth, async (req, res) => {
  try {
    const { fileId } = req.params;

    if (req.user.role !== "admin") {
      const msg = await Message.findOne({ "media.fileId": fileId }).populate("chat");
      const isAvatar = !msg; // agar xabar orasida topilmasa, ehtimol avatar - ochiq ko'rish mumkin
      if (msg) {
        const chat = await Chat.findById(msg.chat._id || msg.chat);
        const isParticipant = chat.participants.some(
          (p) => p.toString() === req.user._id.toString()
        );
        if (!isParticipant) return res.status(403).json({ error: "Ruxsat yo'q" });
      }
    }

    await streamFromGridFS(fileId, res);
  } catch (err) {
    res.status(404).json({ error: "Fayl topilmadi" });
  }
});

module.exports = router;
