const mongoose = require("mongoose");

const ChatSchema = new mongoose.Schema(
  {
    participants: [
      { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    ], // har doim 2 ta

    lastMessageAt: { type: Date, default: Date.now, index: true },
    lastMessagePreview: { type: String, default: "" }, // shifrlangan bo'lishi mumkin, faqat UI uchun

    // Har bir ishtirokchi uchun alohida sozlama (bir tomonlama o'zgartirish mumkin bo'lgan narsalar)
    settings: {
      type: Map,
      of: new mongoose.Schema(
        {
          screenshotBlock: { type: Boolean, default: false }, // "Screenshotni cheklash"
          stealthRead: { type: Boolean, default: false }, // 👻 Sharpa - Seen belgisini yashirish
          isDeletedFor: { type: Boolean, default: false }, // agar shu user chatni o'chirgan bo'lsa
        },
        { _id: false }
      ),
      default: {},
    },

    // Chat darajasidagi shifrlash kaliti - AES-GCM kaliti server tomonda
    // KEK (master key, .env dagi CHAT_ENCRYPTION_KEY) bilan shifrlangan holda saqlanadi.
    encryptedChatKey: { type: String, required: true },

    isFullyDeleted: { type: Boolean, default: false }, // ikkala taraf ham o'chirsa
  },
  { timestamps: true }
);

ChatSchema.index({ participants: 1 });

module.exports = mongoose.models.Chat || mongoose.model("Chat", ChatSchema);
