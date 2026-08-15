// So'rov qaysi domendan kelgan bo'lsa (masalan Vercel'dagi haqiqiy
// domen), shu asosida to'liq (absolute) manzil quradi. Bu Android
// ilovasi (Capacitor - fayllar mahalliy paketda, boshqa "origin")
// ichida ham, veb-saytning o'zida ham media havolalari to'g'ri
// ishlashi uchun kerak - domen qattiq yozilmagan (hardcode qilinmagan),
// shuning uchun domen o'zgarsa ham kod o'zgarmaydi.
function publicBase(req) {
  return `${req.protocol}://${req.get("host")}`;
}
module.exports = { publicBase };
