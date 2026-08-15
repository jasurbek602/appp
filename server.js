require("dotenv").config();
const express = require("express");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const path = require("path");
const connectDB = require("./config/db");

const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const chatRoutes = require("./routes/chatRoutes");
const messageRoutes = require("./routes/messageRoutes");
const mediaRoutes = require("./routes/mediaRoutes");
const adminRoutes = require("./routes/adminRoutes");
const cronRoutes = require("./routes/cronRoutes");

const app = express();

app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());

// Android ilova (Capacitor) fayllari endi mahalliy paketda joylashgan
// va so'rovlarni "https://localhost" (yoki "capacitor://localhost")
// manzilidan yuboradi - bu veb-saytning o'z domenidan farqli origin.
// CLIENT_ORIGIN faqat saytning o'ziga cheklab qo'yilgan bo'lsa ham,
// ilovaning mahalliy manzillariga har doim ruxsat beramiz.
const NATIVE_APP_ORIGINS = ["https://localhost", "capacitor://localhost", "http://localhost"];
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true); // brauzersiz so'rovlar (curl, server-to-server)
      if (!process.env.CLIENT_ORIGIN) return callback(null, true); // cheklov o'rnatilmagan - hammasiga ochiq
      if (origin === process.env.CLIENT_ORIGIN || NATIVE_APP_ORIGINS.includes(origin)) {
        return callback(null, true);
      }
      callback(new Error("CORS: ruxsat etilmagan manzil"));
    },
    credentials: true,
  })
);

// Har bir so'rovdan oldin MongoDB ulanishini kafolatlaymiz
// (Vercel serverless funksiyasi "sovuq" holatdan uyg'onganda ulanish yo'q bo'lishi mumkin)
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error("DB ulanish xatosi:", err.message);
    res.status(500).json({ error: "Server bazaga ulana olmadi" });
  }
});

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/chats", chatRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/media", mediaRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/cron", cronRoutes);

app.get("/api/health", (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// Statik frontend fayllar (public/) - Vercel bularni alohida ham serve qiladi (vercel.json),
// lekin lokal `npm run dev` bilan ishga tushirganda ham ishlashi uchun shu qoladi.
app.use(express.static(path.join(__dirname, "public")));

// Global xato ushlagich
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Kutilmagan server xatosi" });
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  // Faqat lokal ishga tushirishda (npm run dev) portni tinglaymiz.
  // Vercel'da bu qism ishlamaydi - u to'g'ridan-to'g'ri `app`ni chaqiradi.
  app.listen(PORT, () => console.log(`Server http://localhost:${PORT} da ishlamoqda`));
}

module.exports = app; // Vercel @vercel/node uchun kerak
