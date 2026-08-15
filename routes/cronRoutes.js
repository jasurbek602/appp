const router = require("express").Router();
const ChatRequest = require("../models/ChatRequest");

/**
 * Vercel Cron har kuni shu endpointni chaqiradi (vercel.json dagi "crons"
 * bo'limiga qarang). Bu MongoDB'ni keraksiz eski ma'lumotlar bilan
 * to'ldirmaslik uchun 30 kundan oshgan rad etilgan so'rovlarni tozalaydi.
 * Xabarlar/media uchun asosiy tozalash mexanizmi эса Message modelidagi
 * TTL index orqali avtomatik ishlaydi (agar expiresAt qo'yilgan bo'lsa),
 * chatni o'chirish esa har doim darhol hard-delete qiladi (chatRoutes.js).
 */
router.get("/cleanup", async (req, res) => {
  // Vercel Cron, agar CRON_SECRET environment variable o'rnatilgan bo'lsa,
  // so'rovga avtomatik "Authorization: Bearer <CRON_SECRET>" headerini qo'shadi.
  const auth = req.headers["authorization"];
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Ruxsat yo'q" });
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const result = await ChatRequest.deleteMany({
    status: { $in: ["rejected"] },
    updatedAt: { $lt: thirtyDaysAgo },
  });

  res.json({ ok: true, deletedRequests: result.deletedCount });
});

module.exports = router;
