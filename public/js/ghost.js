/**
 * SHARPA REJIM (Ghost Mode Request) - klient tomon logikasi
 *
 * Talab: agar so'rov "ghost" sifatida yuborilsa, bu chat FAQAT so'rovni
 * yuborgan qurilmaning mahalliy xotirasida (localStorage) belgilanadi va
 * boshqa qurilmadan kirganda "chatlar ro'yxati"da har doim ko'rinib turadigan
 * oddiy chat kabi emas, balki alohida yashirin ro'yxatda saqlanadi.
 *
 * Amalga oshirish: backend chatni odatdagidek yaratadi (chunki ikkinchi
 * tarafga xabar yetib borishi va suhbat ishlashi kerak), lekin FAQAT
 * so'rovni yuborgan tomonning shu brauzeridagi localStorage'i orqali,
 * ushbu chat ID "yashirin" deb belgilanadi. Chatlar ro'yxatini chizishda
 * shu ID standart ro'yxatdan chiqarib tashlanadi va alohida "👻 Sharpa
 * chatlar" bo'limida, faqat shu qurilmada ko'rsatiladi.
 */
const GhostStore = {
  KEY: "sc_ghost_chat_ids",

  getIds() {
    try {
      return JSON.parse(localStorage.getItem(this.KEY) || "[]");
    } catch (e) {
      return [];
    }
  },

  markGhost(chatId) {
    const ids = this.getIds();
    if (!ids.includes(chatId)) {
      ids.push(chatId);
      localStorage.setItem(this.KEY, JSON.stringify(ids));
    }
  },

  isGhost(chatId) {
    return this.getIds().includes(chatId);
  },

  unmark(chatId) {
    const ids = this.getIds().filter((id) => id !== chatId);
    localStorage.setItem(this.KEY, JSON.stringify(ids));
  },
};
