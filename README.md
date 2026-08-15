# SecureChat — Xavfsiz va maxfiy muloqot ilovasi

Node.js (Express) + MongoDB (Mongoose, shu jumladan GridFS) + Vercel serverless.

## 1. Arxitektura haqida muhim qarorlar (nima uchun bunday qilindi)

| Talab | Qanday hal qilindi | Nega |
|---|---|---|
| Real-time xabar almashish | Socket.io **emas**, MongoDB polling (`GET /api/messages/:chatId/poll?since=...`), frontend har `POLL_INTERVAL` (default 1200ms, `public/js/app.js`da sozlanadi) millisekundda so'raydi | Vercel serverless funksiyalari statik, uzoq muddatli WebSocket ulanishlarini ushlab turolmaydi |
| Media saqlash | MongoDB **GridFS** (`middleware/upload.js`) | Vercel'da doimiy fayl tizimi yo'q; GridFS hammasini MongoDB ichida saqlaydi, alohida S3/Cloudinary shart emas |
| Xabar shifrlash | AES-256-GCM, har chat uchun alohida kalit, master key bilan shifrlangan holda saqlanadi (`utils/encryption.js`) | Ma'lumotlar bazasi buzilsa ham matn ochiq ko'rinmaydi. To'liq E2EE emas — sabab pastda |
| Skrinshot bloklash | CSS blur + ogohlantirish + PrintScreen/DevTools ushlash (`public/js/screenshot-guard.js`) | Brauzerda skrinshotni 100% bloklaydigan API yo'q — bu **to'sqinlik**, kafolat emas |
| Chatni o'chirish | Hard delete: `Message.deleteMany` + GridFS fayllarni `bucket.delete()` + `Chat.findByIdAndDelete` (`routes/chatRoutes.js`) | Talab qilingan "qaytarib bo'lmaydigan" o'chirish |
| Ghost/Sharpa so'rov | Backendda oddiy chat yaratiladi (ikkinchi tomon albatta xabar oladi), lekin **faqat so'rov yuborgan qurilmaning** `localStorage`'ida ID "sharpa" deb belgilanadi (`public/js/ghost.js`) | Talabning o'ziga ko'ra "faqat shu qurilmada ko'rinadi" — bu tub my mohiyatan klient tomon (localStorage) yechim, boshqa qurilmadan kirsangiz ko'rinmaydi |

### Nega to'liq End-to-End Encryption emas?
Loyihangizda **admin barcha chatlarni, xabarlarni va medialarni ko'ra olishi** talab qilingan (7-band). Bu ikki narsa bir vaqtda bo'lmaydi: yoki (a) faqat ikkala foydalanuvchi o'qiy oladigan haqiqiy E2EE, yoki (b) admin nazorat qila oladigan server-side shifrlash. Men (b)ni tanladim, chunki talablaringizda aniq shunday deyilgan. Agar kelajakda admin monitoringidan voz kechsangiz, chat kalitini foydalanuvchi brauzerida generatsiya qilib, serverga umuman yubormaslik orqali haqiqiy E2EE'ga o'tkazsa bo'ladi.

### Skrinshot bloklash haqida yana bir bor
Iltimos, foydalanuvchilaringizga buni **"kafolatlangan himoya"** emas, balki **"to'sqinlik"** sifatida taqdim eting — noto'g'ri xavfsizlik va'dasi keyinchalik ishonchni yo'qotishga olib kelishi mumkin.

## 2. Loyiha tuzilishi
```
security-chat/
  server.js              # Express app (Vercel handler sifatida export qilinadi)
  vercel.json             # Vercel routing + cron sozlamasi
  config/db.js             # MongoDB ulanish (serverless uchun cache bilan)
  models/                  # User, Chat, ChatRequest, Message (Mongoose)
  middleware/               # auth.js (JWT), upload.js (GridFS)
  routes/                   # auth, users, chats, messages, media, admin, cron
  utils/encryption.js        # AES-256-GCM
  public/                    # Frontend (vanilla HTML/CSS/JS)
    login.html, register.html, chat.html, admin.html
    js/app.js                # asosiy chat logikasi + polling
    js/audio.js               # ovoz yozish + pitch-shift
    js/ghost.js                # sharpa rejim (localStorage)
    js/screenshot-guard.js      # skrinshot to'sqinligi
  scripts/create-admin.js       # birinchi admin yaratish
```

## 3. O'rnatish va Vercel'ga joylash

### 3.1 MongoDB Atlas
1. https://cloud.mongodb.com — bepul cluster yarating.
2. Database Access'da foydalanuvchi yarating, Network Access'da `0.0.0.0/0`ni qo'shing (Vercel IP'lari dinamik).
3. Connection stringni oling — `MONGODB_URI` shu bo'ladi.

### 3.2 Kalitlarni generatsiya qilish
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # JWT_SECRET uchun
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # CHAT_ENCRYPTION_KEY uchun (aynan shu formatda, 64 hex belgi)
```

### 3.3 Lokal ishga tushirish
```bash
npm install
cp .env.example .env   # va qiymatlarni to'ldiring
npm run dev
# http://localhost:3000/register.html
```

### 3.4 Vercel'ga deploy
```bash
npm i -g vercel
vercel login
vercel
```
So'ng Vercel Dashboard → Project → Settings → **Environment Variables**'ga quyidagilarni qo'shing:
`MONGODB_URI`, `JWT_SECRET`, `CHAT_ENCRYPTION_KEY`, `CLIENT_ORIGIN` (masalan `https://loyihangiz.vercel.app`), `CRON_SECRET` (ixtiyoriy, tozalash uchun).

Keyin:
```bash
vercel --prod
```

### 3.5 Birinchi admin yaratish
Bu skript lokal kompyuteringizdan, `.env`dagi `MONGODB_URI` orqali to'g'ridan-to'g'ri Atlas'ga ulanadi:
```bash
node scripts/create-admin.js admin_username kuchli_parol1 xavfsizlik_soz1
```

## 4. Muhim ishlash tafsilotlari

- **Polling intervali**: `public/js/app.js` boshidagi `POLL_INTERVAL` (ms). 0.5s (`500`) ga tushirish mumkin, lekin har faol foydalanuvchi soniyasiga 2 marta so'rov yuboradi — ko'p foydalanuvchida MongoDB Atlas bepul tarifi va Vercel Hobby limitini tezroq tugatadi. Ishlab chiqarishda 1000–2000ms tavsiya etiladi.
- **Media hajmi**: `middleware/upload.js`da 50MB chegara qo'yilgan (`multer` limits) — kerak bo'lsa o'zgartiring, lekin Vercel serverless funksiya body limiti (odatda ~4.5MB request/response, Hobby tarifida) katta videolarga to'sqinlik qilishi mumkin. Katta video uchun kelajakda GridFS'ga to'g'ridan-to'g'ri chunk-based (parcha-parcha) yuklashni ko'rib chiqing.
- **TTL tozalash**: `models/Message.js`dagi `expiresAt` maydoniga sana qo'ysangiz, MongoDB uni avtomatik o'chiradi (TTL index). Hozircha faqat qo'lda o'chirish (chat delete) ishlaydi — bu darhol va butunlay o'chiradi.
- **Cron tozalash**: `vercel.json`dagi `crons` bo'limi har kuni soat 03:00da eski rad etilgan so'rovlarni tozalaydi (faqat Vercel Pro tarifida cron ishlaydi — Hobby tarifida kuniga 1 marta chegarasi bor, buni hisobga oling).

## 5. Xavfsizlik bo'yicha yakuniy eslatma
Bu loyiha yaxshi amaliy xavfsizlik choralarini o'z ichiga oladi (parol hash'lash — bcrypt, AES-256-GCM shifrlash, JWT httpOnly cookie, rate-limiting, GridFS orqali fayl izolyatsiyasi). Lekin **"hech kim hech qachon kira olmaydi"** kabi mutlaq va'dalar hech qanday tizim uchun to'g'ri emas — xavfsizlik doimiy jarayon: kutubxonalarni yangilab turing, `.env` sirlarini hech qachon repo'ga qo'shmang, va production'da muntazam xavfsizlik tekshiruvidan o'tkazing.
