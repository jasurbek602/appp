const mongoose = require("mongoose");

const MessageSchema = new mongoose.Schema(
  {
    chat: { type: mongoose.Schema.Types.ObjectId, ref: "Chat", required: true, index: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    type: {
      type: String,
      enum: ["text", "audio", "image", "video"],
      default: "text",
    },

    // Matn AES-256-GCM bilan shifrlangan holda saqlanadi: { iv, authTag, data } base64
    cipherText: {
      iv: String,
      authTag: String,
      data: String,
    },

    // Media GridFS'da saqlanadi, bu yerda faqat fayl id va meta bor.
    // Audio uchun pitchShift qiymati - qanday effekt qo'llanilgani (frontendda qayta ishlash uchun emas,
    // faqat tarixiy ma'lumot sifatida; asl ovoz allaqachon effekt bilan yozib olingan bo'ladi).
    media: {
      fileId: { type: mongoose.Schema.Types.ObjectId, default: null },
      mimeType: String,
      sizeBytes: Number,
      durationSec: Number, // audio/video uchun
      pitchShift: { type: Number, default: 0 }, // ovoz o'zgartirish darajasi
    },

    seenBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    deliveredTo: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

    isEdited: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false }, // "hamma uchun o'chirish" - kontent tozalanadi, tombstone qoladi

    // Soft-delete emas — chat o'chirilganda bu hujjatlarning o'zi butunlay
    // o'chiriladi (routes/chatRoutes.js dagi hard-delete ga qarang).
    // TTL faqat "expiresAt" qo'yilgan xabarlar uchun (masalan admin siyosati
    // yoki avtomatik tozalash bo'lsa) ishlaydi.
    expiresAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Agar xabarga expiresAt qo'yilsa, MongoDB uni avtomatik o'chiradi (TTL index).
// expireAfterSeconds: 0 -> aynan expiresAt vaqtida o'chiriladi.
MessageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Polling uchun tez qidiruv: "shu chatda, shu sanadan keyingi (yoki
// tahrirlangan/o'chirilgan) xabarlar" - updatedAt bo'yicha ham
MessageSchema.index({ chat: 1, createdAt: 1 });
MessageSchema.index({ chat: 1, updatedAt: 1 });

module.exports = mongoose.models.Message || mongoose.model("Message", MessageSchema);
