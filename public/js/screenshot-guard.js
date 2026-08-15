/**
 * "SCREENSHOTNI CHEKLASH" - HALOL TAVSIF
 *
 * Veb-brauzerda skrinshot yoki ekran yozib olishni 100% bloklaydigan
 * hech qanday standart JavaScript/CSS API mavjud emas. Quyidagi kod
 * faqat TO'SQINLIK va OGOHLANTIRISH vositalarini beradi:
 *   1. PrintScreen tugmasi bosilganda ogohlantirish ko'rsatiladi
 *      (lekin skrinshot allaqachon olib bo'lingan bo'ladi - buferni
 *      tozalab bo'lmaydi).
 *   2. Oyna fokusni yo'qotganda (masalan foydalanuvchi boshqa dastur
 *      bilan skrinshot vositasini ochsa) xabarlar avtomatik blur qilinadi.
 *   3. O'ng tugma va DevTools ochish (F12) cheklanadi - lekin buni
 *      texnik jihatdan bilgan foydalanuvchi osongina chetlab o'tishi mumkin.
 *   4. "prefers-reduced-motion" kabi haqiqiy operatsion tizim darajasidagi
 *      skrinshot API'lariga (masalan macOS/Windows) veb-sahifa umuman
 *      kira olmaydi.
 *
 * Bu funksiyalarni foydalanuvchiga "kafolatlangan himoya" sifatida emas,
 * balki "tasodifiy/beparvo skrinshotlarga to'sqinlik" sifatida taqdim eting.
 */
const ScreenshotGuard = {
  enabled: false,
  container: null,
  hideTimer: null,

  init(messagesEl) {
    this.container = messagesEl;

    document.addEventListener("keyup", (e) => {
      if (!this.enabled) return;
      if (e.key === "PrintScreen") {
        this.hideForScreenshot();
        this.showWarning();
        // Clipboard'ni tozalashga urinish (ba'zi brauzerlarda ishlamasligi mumkin, kafolat emas)
        navigator.clipboard?.writeText("").catch(() => {});
      }
    });

    document.addEventListener("keydown", (e) => {
      if (!this.enabled) return;
      // DevTools / view-source ni ochishga urinishni cheklash (to'liq kafolat emas)
      if (
        e.key === "F12" ||
        (e.ctrlKey && e.shiftKey && ["I", "J", "C"].includes(e.key)) ||
        (e.ctrlKey && e.key === "u")
      ) {
        e.preventDefault();
        this.showWarning();
      }
    });

    document.addEventListener("contextmenu", (e) => {
      if (this.enabled) e.preventDefault();
    });

    window.addEventListener("blur", () => {
      if (this.enabled) this.container?.classList.add("window-blurred");
    });
    window.addEventListener("focus", () => {
      this.container?.classList.remove("window-blurred");
    });
    document.addEventListener("visibilitychange", () => {
      if (this.enabled && document.hidden) {
        this.container?.classList.add("window-blurred");
      }
    });
  },

  enable() {
    this.enabled = true;
    this.container?.classList.add("active");
  },
  disable() {
    this.enabled = false;
    clearTimeout(this.hideTimer);
    this.container?.classList.remove("active", "window-blurred", "ss-hidden");
  },

  // PrintScreen bosilgan zahoti xabarlarni ~2 soniyaga yashiradi, so'ng
  // avtomatik o'z holiga qaytaradi. Bu skrinshotning o'zini bloklamaydi
  // (imkonsiz), lekin ekranga tushib qolgan tasvirda xabarlar bo'sh chiqadi.
  hideForScreenshot() {
    if (!this.enabled || !this.container) return;
    this.container.classList.add("ss-hidden");
    clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => {
      this.container?.classList.remove("ss-hidden");
    }, 2000);
  },

  showWarning() {
    let overlay = document.getElementById("ssWarning");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "ssWarning";
      overlay.className = "screenshot-warning-overlay";
      overlay.innerHTML =
        "<div style='font-size:34px'>🛡️</div><div>Bu chatda skrinshot cheklovi yoqilgan.<br>Iltimos, suhbat maxfiyligini hurmat qiling.</div>";
      document.body.appendChild(overlay);
    }
    overlay.classList.add("show");
    setTimeout(() => overlay.classList.remove("show"), 2200);
  },
};
