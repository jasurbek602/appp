/**
 * Ishlatish: node scripts/create-admin.js <username> <password> <secretKey>
 * .env faylida MONGODB_URI to'g'ri sozlangan bo'lishi kerak.
 */
require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../models/User");

async function main() {
  const [, , username, password, secretKey] = process.argv;
  if (!username || !password || !secretKey) {
    console.log("Ishlatish: node scripts/create-admin.js <username> <password> <secretKey>");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);

  const existing = await User.findOne({ username: username.toLowerCase() });
  if (existing) {
    existing.role = "admin";
    await existing.save();
    console.log(`✅ Mavjud foydalanuvchi "${username}" admin qilindi.`);
  } else {
    await User.create({
      username: username.toLowerCase(),
      passwordHash: await User.hashValue(password),
      secretKeyHash: await User.hashValue(secretKey),
      role: "admin",
    });
    console.log(`✅ Yangi admin "${username}" yaratildi.`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
