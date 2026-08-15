const crypto = require("crypto");

/**
 * SHIFRLASH ARXITEKTURASI (halol tushuntirish):
 *
 * 1) Har bir Chat yaratilganda tasodifiy 256-bit AES kalit generatsiya qilinadi.
 * 2) Bu kalit .env dagi MASTER KEY (CHAT_ENCRYPTION_KEY) bilan shifrlanib,
 *    Chat hujjatida "encryptedChatKey" sifatida saqlanadi.
 * 3) Har bir xabar shu chat kaliti bilan AES-256-GCM orqali shifrlanadi
 *    (IV har xabar uchun boshqacha - takrorlanmaydi).
 * 4) Bu "ma'lumotlar bazasi buzilsa ham xabar matni ochiq ko'rinmaydi" darajasidagi
 *    xavfsizlikni beradi (encryption at rest) + HTTPS orqali uzatishda TLS bor.
 *
 * MUHIM CHEKLOV: Bu klassik server-side encryption, to'liq E2EE (Signal
 * darajasidagi) emas — chunki server chat kalitini deshifrlay oladi
 * (masalan admin monitoring talabi shuni talab qiladi — 7-band).
 * Agar to'liq E2EE kerak bo'lsa, admin xabarlarni ko'ra olmaydi, bu ikkalasi
 * birga bo'lmaydi. Loyihangizda admin monitoring talab qilingani uchun
 * server-side encryption tanlandi.
 */

const ALGO = "aes-256-gcm";

function getMasterKey() {
  const key = process.env.CHAT_ENCRYPTION_KEY;
  if (!key || key.length !== 64) {
    throw new Error(
      "CHAT_ENCRYPTION_KEY .env faylida 64 ta hex belgidan iborat (32 bayt) bo'lishi kerak. " +
        "Generatsiya: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  }
  return Buffer.from(key, "hex");
}

function generateChatKey() {
  return crypto.randomBytes(32); // yangi chat uchun tasodifiy kalit
}

function encryptChatKey(chatKeyBuffer) {
  const master = getMasterKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, master, iv);
  const enc = Buffer.concat([cipher.update(chatKeyBuffer), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(".");
}

function decryptChatKey(encryptedString) {
  const master = getMasterKey();
  const [ivB64, tagB64, dataB64] = encryptedString.split(".");
  const decipher = crypto.createDecipheriv(ALGO, master, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]);
}

function encryptMessage(plainText, chatKeyBuffer) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, chatKeyBuffer, iv);
  const enc = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString("base64"),
    authTag: tag.toString("base64"),
    data: enc.toString("base64"),
  };
}

function decryptMessage({ iv, authTag, data }, chatKeyBuffer) {
  const decipher = crypto.createDecipheriv(ALGO, chatKeyBuffer, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(authTag, "base64"));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(data, "base64")),
    decipher.final(),
  ]);
  return dec.toString("utf8");
}

module.exports = {
  generateChatKey,
  encryptChatKey,
  decryptChatKey,
  encryptMessage,
  decryptMessage,
};
