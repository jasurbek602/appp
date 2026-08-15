const multer = require("multer");
const mongoose = require("mongoose");
const { Readable } = require("stream");

/**
 * MUHIM: Vercel serverless funksiyalarida diskka fayl yozib bo'lmaydi
 * (fayl tizimi vaqtinchalik va faqat /tmp o'qish-yozish uchun ochiq,
 * lekin funksiyalar orasida saqlanmaydi). Shuning uchun fayllarni
 * diskka emas, xotiraga (memoryStorage) olib, so'ng to'g'ridan-to'g'ri
 * MongoDB GridFS'ga oqim (stream) sifatida yozamiz.
 *
 * GridFS - MongoDB'ning o'zi taqdim etadigan katta fayllarni (16MB dan
 * katta bo'lishi mumkin) bo'laklarga (chunks) bo'lib saqlash mexanizmi.
 * Shu bilan "hammasi MongoDB orqali" talabingiz bajariladi, alohida
 * fayl serveriga (S3 va h.k.) hojat qolmaydi.
 */

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB - video uchun yetarli chegara
});

function getGridFSBucket() {
  const db = mongoose.connection.db;
  return new mongoose.mongo.GridFSBucket(db, { bucketName: "media" });
}

async function saveBufferToGridFS(buffer, filename, mimeType) {
  const bucket = getGridFSBucket();
  return new Promise((resolve, reject) => {
    const uploadStream = bucket.openUploadStream(filename, {
      contentType: mimeType,
    });
    Readable.from(buffer)
      .pipe(uploadStream)
      .on("error", reject)
      .on("finish", () => resolve(uploadStream.id));
  });
}

async function streamFromGridFS(fileId, res) {
  const bucket = getGridFSBucket();
  const _id = new mongoose.Types.ObjectId(fileId);
  const files = await bucket.find({ _id }).toArray();
  if (!files.length) {
    res.status(404).json({ error: "Fayl topilmadi" });
    return;
  }
  res.set("Content-Type", files[0].contentType || "application/octet-stream");
  res.set("Cache-Control", "private, max-age=31536000, immutable");
  bucket.openDownloadStream(_id).pipe(res);
}

async function deleteFromGridFS(fileId) {
  if (!fileId) return;
  const bucket = getGridFSBucket();
  try {
    await bucket.delete(new mongoose.Types.ObjectId(fileId));
  } catch (e) {
    // fayl allaqachon o'chirilgan bo'lishi mumkin - jim o'tkazamiz
  }
}

module.exports = { upload, saveBufferToGridFS, streamFromGridFS, deleteFromGridFS };
