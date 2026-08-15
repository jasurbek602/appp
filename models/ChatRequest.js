const mongoose = require("mongoose");

const ChatRequestSchema = new mongoose.Schema(
  {
    from: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    to: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    status: {
      type: String,
      enum: ["pending", "accepted", "rejected"],
      default: "pending",
      index: true,
    },

    // Sharpa rejim: true bo'lsa, bu chat SERVERDA umuman "Chat" hujjati
    // sifatida qat'iy ko'rinadigan qilib yaratilmaydi - faqat qabul
    // qilingandan keyin, so'rovni yuborgan tomonning brauzerida
    // localStorage/IndexedDB'da chat ID saqlanadi va u boshqa
    // qurilmada chatlar ro'yxatida ko'rsatilmaydi (frontend js/ghost.js'ga qarang).
    isGhostRequest: { type: Boolean, default: false },
  },
  { timestamps: true }
);

ChatRequestSchema.index({ from: 1, to: 1 }, { unique: false });

module.exports =
  mongoose.models.ChatRequest || mongoose.model("ChatRequest", ChatRequestSchema);
