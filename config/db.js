const mongoose = require("mongoose");

/**
 * MUHIM: Vercel serverless muhitida har bir so'rov yangi funksiya
 * chaqiruvi bo'lishi mumkin. Agar har safar yangi MongoDB ulanish
 * ochilsa, Atlas ulanish limiti tez tugaydi. Shuning uchun global
 * cache orqali ulanishni qayta ishlatamiz (Vercel rasmiy tavsiyasi).
 */
let cached = global._mongooseConn;
if (!cached) {
  cached = global._mongooseConn = { conn: null, promise: null };
}

async function connectDB() {
  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("MONGODB_URI .env faylida topilmadi");

    cached.promise = mongoose
      .connect(uri, {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 8000,
      })
      .then((m) => m);
  }

  cached.conn = await cached.promise;
  return cached.conn;
}

module.exports = connectDB;
