const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const UserSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      minlength: 3,
      maxlength: 30,
      match: /^[a-z0-9._]+$/, // Instagram uslubidagi username
      index: true,
    },
    fullName: { type: String, trim: true, maxlength: 50, default: "" },
    passwordHash: { type: String, required: true },

    // Parolni tiklash uchun majburiy "Xavfsizlik Kalit So'zi".
    // Hech qachon oddiy matn holida saqlanmaydi - faqat hash.
    secretKeyHash: { type: String, required: true },

    avatarFileId: { type: mongoose.Schema.Types.ObjectId, default: null }, // GridFS fayl id
    role: { type: String, enum: ["user", "admin"], default: "user" },

    theme: { type: String, enum: ["dark", "light"], default: "dark" },

    // Har bir foydalanuvchining shifrlash uchun public kaliti (ECDH/X25519 yoki RSA public)
    // Shu orqali "end-to-end" ga yaqin shifrlash mexanizmi quriladi.
    publicKey: { type: String, default: null },

    isOnline: { type: Boolean, default: false },
    lastSeen: { type: Date, default: Date.now },

    isBanned: { type: Boolean, default: false }, // admin tomonidan bloklash
  },
  { timestamps: true }
);

UserSchema.methods.comparePassword = function (plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

UserSchema.methods.compareSecretKey = function (plain) {
  return bcrypt.compare(plain, this.secretKeyHash);
};

UserSchema.statics.hashValue = function (plain) {
  return bcrypt.hash(plain, 12);
};

module.exports = mongoose.models.User || mongoose.model("User", UserSchema);
