// ====== SOZLAMALAR ======
// Real-time o'rniga polling: Vercel serverless muhitida doimiy Socket.io
// ulanishi barqaror ishlamaydi (server.js izohiga qarang). Shu sabab
// har POLL_INTERVAL millisekundda MongoDB'dan yangi xabar bor-yo'qligi
// tekshiriladi. 1200-2000ms tavsiya etiladi; 500ms ham ishlaydi, lekin
// server so'rov sonini ~4 barobar oshiradi (xarajat/limit nazarda tutilsin).
const POLL_INTERVAL = 1200;
// Chatlar ro'yxati va kiruvchi so'rovlar uchun alohida, kamroq tez-tez
// so'rov: kimdir yangi so'rov yuborsa yoki so'rovni qabul qilsa, bu
// sahifani qayta yuklamasdan (F5) ham chap paneldagi ro'yxatda darhol
// (eng ko'pi bilan SIDEBAR_POLL_INTERVAL ichida) ko'rinishi kerak.
const SIDEBAR_POLL_INTERVAL = 4000;

let ME = null;
let activeChat = null; // { id, partner }
let pollTimer = null;
let sidebarPollTimer = null;
let lastPollTime = null;
let pitchModeOn = false;

// ---------- BOSHLASH ----------
(async function init() {
  try {
    const { user } = await API.get("/api/users/me");
    ME = user;
  } catch (e) {
    return (window.location.href = "/login.html");
  }

  document.getElementById("meName").textContent = ME.username;
  document.getElementById("meAvatar").textContent = ME.username[0].toUpperCase();
  if (ME.avatarFileId) {
    document.getElementById("meAvatar").innerHTML = `<img class="avatar" src="${API_BASE}/api/media/${ME.avatarFileId}" />`;
  }
  if (ME.role === "admin") document.getElementById("adminLink").style.display = "flex";
  document.documentElement.setAttribute("data-theme", ME.theme || "dark");

  bindGlobalEvents();
  await refreshSidebar();
  ScreenshotGuard.init(document.getElementById("messages"));
  sidebarPollTimer = setInterval(refreshSidebar, SIDEBAR_POLL_INTERVAL);
})();

// So'rovlar ro'yxatini, so'ng chatlar ro'yxatini yangilaydi (shu tartibda -
// loadChats() oxirida joriy tabni qayta chizadi, shuning uchun "requests"
// tabi ham eng so'nggi ma'lumot bilan chiziladi).
async function refreshSidebar() {
  try {
    await loadRequests();
    await loadChats();
  } catch (e) { /* jimgina keyingi urinishga qoldiramiz */ }
}

function bindGlobalEvents() {
  document.getElementById("themeToggle").addEventListener("click", () => Theme.toggle());

  document.getElementById("logoutBtn").addEventListener("click", async (e) => {
    e.preventDefault();
    await API.post("/api/auth/logout");
    window.location.href = "/login.html";
  });

  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      renderTab(tab.dataset.tab);
    });
  });

  let searchDebounce;
  document.getElementById("searchInput").addEventListener("input", (e) => {
    clearTimeout(searchDebounce);
    const q = e.target.value.trim();
    const box = document.getElementById("searchResults");
    if (!q) { box.style.display = "none"; return; }
    searchDebounce = setTimeout(async () => {
      const { users } = await API.get("/api/users/search?q=" + encodeURIComponent(q));
      renderSearchResults(users);
    }, 300);
  });

  document.getElementById("textInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendText();
  });
  document.getElementById("sendBtn").addEventListener("click", sendText);

  document.getElementById("attachBtn").addEventListener("click", () => document.getElementById("mediaInput").click());
  document.getElementById("mediaInput").addEventListener("change", handleMediaSelect);

  document.getElementById("recordBtn").addEventListener("click", toggleRecording);
  document.getElementById("pitchBtn").addEventListener("click", () => {
    pitchModeOn = !pitchModeOn;
    document.getElementById("pitchBtn").classList.toggle("on", pitchModeOn);
    showToast(pitchModeOn ? "Ovoz o'zgartirish yoqildi (ovozli xabar yuborganda qo'llanadi)" : "Ovoz o'zgartirish o'chirildi");
  });

  document.getElementById("ssBtn").addEventListener("click", toggleScreenshotBlock);
  document.getElementById("stealthBtn").addEventListener("click", toggleStealthRead);
  document.getElementById("deleteChatBtn").addEventListener("click", deleteActiveChat);
  document.getElementById("backBtn").addEventListener("click", closeActiveChatMobile);
  document.getElementById("cancelEditBtn").addEventListener("click", cancelEdit);
}

// ---------- QIDIRUV & SO'ROV YUBORISH ----------
function renderSearchResults(users) {
  const box = document.getElementById("searchResults");
  if (!users.length) { box.style.display = "none"; return; }
  box.style.display = "block";
  box.innerHTML = users.map((u) => `
    <div class="search-result-item" data-username="${u.username}">
      <div class="avatar sm">${u.username[0].toUpperCase()}</div>
      <div class="item-text">
        <div class="item-name">${escapeHtml(u.username)}</div>
        <div class="item-preview">${u.isOnline ? "Onlayn" : "Oflayn"}</div>
      </div>
      <button class="btn secondary" style="width:auto;padding:6px 10px;font-size:11px" data-action="normal">Yuborish</button>
      <button class="btn secondary" style="width:auto;padding:6px 10px;font-size:11px" data-action="ghost">👻</button>
    </div>`).join("");

  box.querySelectorAll(".search-result-item").forEach((item) => {
    const username = item.dataset.username;
    item.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const ghost = btn.dataset.action === "ghost";
        try {
          await API.post("/api/chats/request", { toUsername: username, ghostMode: ghost });
          showToast(ghost ? "👻 Sharpa so'rov yuborildi" : "So'rov yuborildi");
          document.getElementById("searchInput").value = "";
          box.style.display = "none";
          await refreshSidebar();
        } catch (err) { showToast(err.message); }
      });
    });
  });
}

// ---------- CHAT SO'ROVLARI ----------
let pendingRequests = [];
async function loadRequests() {
  const { requests } = await API.get("/api/chats/requests");
  pendingRequests = requests;
  document.getElementById("reqCount").textContent = requests.length ? `(${requests.length})` : "";
}

function renderRequests() {
  const list = document.getElementById("chatList");
  if (!pendingRequests.length) {
    list.innerHTML = `<div class="empty-state" style="height:auto;padding:30px">Yangi so'rovlar yo'q</div>`;
    return;
  }
  list.innerHTML = pendingRequests.map((r) => `
    <div class="request-item">
      <div class="avatar sm">${r.from.username[0].toUpperCase()}</div>
      <div class="item-text">
        <div class="item-name">${escapeHtml(r.from.username)}</div>
        <div class="item-preview">Sizga chat so'rovi yubordi</div>
      </div>
      <button class="btn" style="width:auto;padding:6px 10px;font-size:11px" data-id="${r._id}" data-action="accept">Qabul</button>
      <button class="btn secondary" style="width:auto;padding:6px 10px;font-size:11px" data-id="${r._id}" data-action="reject">Rad</button>
    </div>`).join("");

  list.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        await API.post(`/api/chats/requests/${btn.dataset.id}/respond`, { action: btn.dataset.action });
        showToast(btn.dataset.action === "accept" ? "Chat qabul qilindi" : "So'rov rad etildi");
        await refreshSidebar();
      } catch (err) { showToast(err.message); }
    });
  });
}

// ---------- CHATLAR RO'YXATI ----------
// Eslatma: ilgari qabul qilingan "ghost" so'rovlar shu qurilmada
// avtomatik ravishda "Sharpa" bo'limiga yashiringan edi - bu ikkala
// tomon uchun ham chalkash bo'lgani uchun OLIB TASHLANDI. Endi har bir
// qabul qilingan chat, kim ghost so'rov yuborgan bo'lishidan qat'iy
// nazar, HAR IKKALA tomon uchun ham oddiy "Chatlar" bo'limida chiqadi.
let allChats = [];
async function loadChats() {
  const { chats } = await API.get("/api/chats");
  allChats = chats;
  renderTab(document.querySelector(".tab.active")?.dataset.tab || "chats");
}

function renderTab(tab) {
  if (tab === "requests") return renderRequests();
  if (tab === "ghost") return renderChatList(allChats.filter((c) => GhostStore.isGhost(c._id)), true);
  return renderChatList(allChats.filter((c) => !GhostStore.isGhost(c._id)), false);
}

function renderChatList(chats, isGhostTab) {
  const list = document.getElementById("chatList");
  if (!chats.length) {
    list.innerHTML = `<div class="empty-state" style="height:auto;padding:30px">${isGhostTab ? "👻 Sharpa chatlar yo'q (faqat shu qurilmada ko'rinadi)" : "Hali chatlar yo'q"}</div>`;
    return;
  }
  list.innerHTML = chats.map((c) => {
    const partner = c.participants.find((p) => String(p._id) !== String(ME._id || ME.id));
    return `
      <div class="chat-list-item ${activeChat?.id === c._id ? "active" : ""}" data-id="${c._id}">
        <div class="avatar sm">${partner ? partner.username[0].toUpperCase() : "?"}</div>
        <div class="item-text">
          <div class="item-name">${partner ? escapeHtml(partner.username) : "Noma'lum"}</div>
          <div class="item-preview">${escapeHtml(c.lastMessagePreview || "Suhbatni boshlang")}</div>
        </div>
        ${isGhostTab ? '<span class="badge">👻</span>' : ""}
      </div>`;
  }).join("");

  list.querySelectorAll(".chat-list-item").forEach((el) => {
    el.addEventListener("click", () => {
      const chat = chats.find((c) => c._id === el.dataset.id);
      openChat(chat);
    });
  });
}

// ---------- FAOL CHATNI OCHISH ----------
async function openChat(chat) {
  const partner = chat.participants.find((p) => String(p._id) !== String(ME._id || ME.id));
  activeChat = { id: chat._id, partner, settings: chat.settings?.[ME.id] || chat.settings?.[ME._id] || {} };

  document.getElementById("emptyState").style.display = "none";
  document.getElementById("activeChat").style.display = "flex";
  document.getElementById("app").classList.add("chat-open"); // mobil: faqat chat oynasi ko'rinadi
  document.getElementById("partnerName").textContent = partner?.username || "—";
  document.getElementById("partnerStatus").textContent = partner?.isOnline ? "Onlayn" : "Oflayn";
  document.getElementById("partnerAvatar").textContent = partner ? partner.username[0].toUpperCase() : "?";

  document.getElementById("ssBtn").classList.toggle("on", !!activeChat.settings.screenshotBlock);
  document.getElementById("stealthBtn").classList.toggle("on", !!activeChat.settings.stealthRead);
  activeChat.settings.screenshotBlock ? ScreenshotGuard.enable() : ScreenshotGuard.disable();

  document.getElementById("messages").innerHTML = "";
  messageRowById.clear(); // yangi chat ochilganda eski xabar-id xaritasini tozalaymiz
  messageDataById.clear();
  cancelEdit();
  const { messages } = await API.get(`/api/messages/${chat._id}`);
  messages.forEach(renderMessage);
  scrollToBottom();

  await API.post(`/api/messages/${chat._id}/seen`);
  lastPollTime = new Date().toISOString();
  restartPolling();
}

function restartPolling() {
  clearInterval(pollTimer);
  pollTimer = setInterval(pollMessages, POLL_INTERVAL);
}

async function pollMessages() {
  if (!activeChat) return;
  try {
    const { messages, serverTime } = await API.get(
      `/api/messages/${activeChat.id}/poll?since=${encodeURIComponent(lastPollTime)}`
    );
    if (messages.length) {
      messages.forEach(renderMessage);
      scrollToBottom();
      const hasIncoming = messages.some((m) => !isMineMessage(m));
      if (hasIncoming) await API.post(`/api/messages/${activeChat.id}/seen`);
    }
    lastPollTime = serverTime;
  } catch (e) { /* jimgina keyingi urinishga qoldiramiz */ }
}

// ---------- XABAR RENDER QILISH ----------
// Bir xil xabar (masalan yuborilgandan keyin darhol chizilgani + keyinroq
// polling orqali qayta kelgani) ikki marta pufakcha bo'lib chiqmasligi
// uchun, har bir xabar ID bo'yicha faqat bitta DOM elementi saqlanadi.
// Xabar qayta kelsa (masalan "O'qildi" holati yangilangani uchun),
// yangi pufakcha qo'shilmaydi - faqat mavjud pufakchaning holat matni
// yangilanadi.
let messageRowById = new Map();

function isMineMessage(m) {
  // sender ba'zan oddiy id (string), ba'zan populate qilingan { _id, ... }
  // obyekt bo'lishi mumkin - shuning uchun ikkalasini ham hisobga olamiz
  // va doim string sifatida solishtiramiz.
  const senderId = m.sender && typeof m.sender === "object" ? (m.sender._id || m.sender.id) : m.sender;
  const myId = ME._id || ME.id;
  return String(senderId) === String(myId);
}

function messageMetaText(m, isMe) {
  const time = new Date(m.createdAt).toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit" });
  const edited = m.isEdited ? " • tahrirlangan" : "";
  if (!isMe) return time + edited;
  const isRead = m.seenBy && m.seenBy.length > 0;
  return `${time}${edited} • ${isRead ? "O'qildi" : "Yuborildi"}`;
}

// Xabarlarni id bo'yicha saqlaymiz - tahrirlash/o'chirish uchun matn va
// egalik (isMe) ma'lumoti kerak bo'ladi (menyu ochilganda).
let messageDataById = new Map();
let openMenuId = null;
let editingMessageId = null;

function closeMessageMenu() {
  if (openMenuId) {
    const row = messageRowById.get(openMenuId);
    row?.querySelector(".msg-menu")?.classList.remove("open");
    openMenuId = null;
  }
}

function renderMessage(m) {
  const msgId = String(m.id || m._id);
  const isMe = isMineMessage(m);

  if (m.isDeleted) {
    // Xabar o'chirilgan - ikkala tomondan ham darhol butunlay olib tashlanadi
    const row = messageRowById.get(msgId);
    if (row) row.remove();
    messageRowById.delete(msgId);
    messageDataById.delete(msgId);
    if (editingMessageId === msgId) cancelEdit();
    return;
  }

  messageDataById.set(msgId, m);

  const existingRow = messageRowById.get(msgId);
  if (existingRow) {
    // Xabar allaqachon chizilgan - matn/holatini (tahrirlangan/O'qildi) yangilaymiz
    if (m.type === "text") {
      const bubbleText = existingRow.querySelector(".bubble-text");
      if (bubbleText) bubbleText.textContent = m.text;
    }
    const meta = existingRow.querySelector(".msg-meta");
    if (meta) meta.textContent = messageMetaText(m, isMe);
    return;
  }

  const row = document.createElement("div");
  row.className = "msg-row " + (isMe ? "me" : "them");

  const bubble = document.createElement("div");
  bubble.className = "bubble";

  if (m.type === "text") {
    const span = document.createElement("span");
    span.className = "bubble-text";
    span.textContent = m.text;
    bubble.appendChild(span);
  } else if (m.type === "image") {
    bubble.innerHTML = `<img src="${m.media.url}" />`;
  } else if (m.type === "video") {
    bubble.innerHTML = `<video src="${m.media.url}" controls></video>`;
  } else if (m.type === "audio") {
    bubble.innerHTML = `<audio src="${m.media.url}" controls></audio>`;
  }

  // Faqat o'z xabarlarimizda tahrirlash/o'chirish menyusi (backend ham
  // faqat egasiga ruxsat beradi) - 3 nuqta tugma, bosilsa yuqoridan
  // pastga ochiladigan menyu.
  if (isMe && m.type === "text") {
    const dotsBtn = document.createElement("button");
    dotsBtn.className = "msg-dots";
    dotsBtn.type = "button";
    dotsBtn.title = "Ko'proq";
    dotsBtn.textContent = "⋮";

    const menu = document.createElement("div");
    menu.className = "msg-menu";
    menu.innerHTML = `
      <button type="button" data-action="edit">✏️ Tahrirlash</button>
      <button type="button" data-action="delete">🗑️ O'chirish</button>`;

    dotsBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = menu.classList.contains("open");
      closeMessageMenu();
      if (!isOpen) {
        menu.classList.add("open");
        openMenuId = msgId;
      }
    });
    menu.querySelector('[data-action="edit"]').addEventListener("click", (e) => {
      e.stopPropagation();
      closeMessageMenu();
      startEdit(msgId);
    });
    menu.querySelector('[data-action="delete"]').addEventListener("click", (e) => {
      e.stopPropagation();
      closeMessageMenu();
      deleteMessage(msgId);
    });

    bubble.appendChild(dotsBtn);
    bubble.appendChild(menu);
  }

  const meta = document.createElement("div");
  meta.className = "msg-meta";
  meta.textContent = messageMetaText(m, isMe);

  row.appendChild(bubble);
  row.appendChild(meta);
  document.getElementById("messages").appendChild(row);
  messageRowById.set(msgId, row);
}

document.addEventListener("click", closeMessageMenu);

function scrollToBottom() {
  const box = document.getElementById("messages");
  box.scrollTop = box.scrollHeight;
}

// ---------- XABAR YUBORISH / TAHRIRLASH ----------
async function sendText() {
  const input = document.getElementById("textInput");
  const text = input.value.trim();
  if (!text || !activeChat) return;

  if (editingMessageId) {
    const id = editingMessageId;
    input.value = "";
    cancelEdit();
    try {
      const { message } = await API.patch(`/api/messages/${activeChat.id}/${id}`, { text });
      renderMessage(message);
    } catch (err) { showToast(err.message); }
    return;
  }

  input.value = "";
  try {
    const { message } = await API.post(`/api/messages/${activeChat.id}/text`, { text });
    renderMessage(message);
    scrollToBottom();
  } catch (err) { showToast(err.message); }
}

function startEdit(msgId) {
  const m = messageDataById.get(msgId);
  if (!m || m.type !== "text") return;
  editingMessageId = msgId;
  const input = document.getElementById("textInput");
  input.value = m.text;
  input.focus();
  document.getElementById("editingBar").style.display = "flex";
}

function cancelEdit() {
  editingMessageId = null;
  const bar = document.getElementById("editingBar");
  if (bar) bar.style.display = "none";
  const input = document.getElementById("textInput");
  if (input) input.value = "";
}

async function deleteMessage(msgId) {
  if (!activeChat) return;
  if (!confirm("Xabar ikkala tomondan ham butunlay o'chiriladi. Davom etasizmi?")) return;
  try {
    await API.delete(`/api/messages/${activeChat.id}/${msgId}`);
    const row = messageRowById.get(msgId);
    if (row) row.remove();
    messageRowById.delete(msgId);
    messageDataById.delete(msgId);
    if (editingMessageId === msgId) cancelEdit();
  } catch (err) { showToast(err.message); }
}

async function handleMediaSelect(e) {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file || !activeChat) return;
  const type = file.type.startsWith("video") ? "video" : "image";
  await uploadMedia(file, type);
}

async function uploadMedia(file, type, extra = {}) {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("type", type);
  if (extra.durationSec) fd.append("durationSec", extra.durationSec);
  if (extra.pitchShift) fd.append("pitchShift", extra.pitchShift);
  try {
    const { message } = await API.post(`/api/messages/${activeChat.id}/media`, fd, true);
    renderMessage(message);
    scrollToBottom();
  } catch (err) { showToast(err.message); }
}

// ---------- OVOZLI XABAR ----------
let isRecording = false;
async function toggleRecording() {
  const btn = document.getElementById("recordBtn");
  if (!isRecording) {
    try {
      await VoiceRecorder.start();
      isRecording = true;
      btn.classList.add("recording");
      showToast("Yozib olinmoqda... to'xtatish uchun qayta bosing");
    } catch (e) { showToast("Mikrofonga ruxsat berilmadi"); }
  } else {
    isRecording = false;
    btn.classList.remove("recording");
    let blob = await VoiceRecorder.stop();
    let pitch = 1;
    if (pitchModeOn) {
      pitch = await pickPitch();
      blob = await applyPitchShift(blob, pitch);
    }
    const file = new File([blob], "voice.wav", { type: blob.type });
    await uploadMedia(file, "audio", { pitchShift: pitch !== 1 ? pitch : 0 });
  }
}

function pickPitch() {
  // Oddiy tanlov: chuqur ovoz yoki nozik ovoz
  return new Promise((resolve) => {
    const deep = confirm("Ovozni o'zgartirish: OK = qalinroq ovoz, Bekor qilish = nozikroq ovoz");
    resolve(deep ? 0.78 : 1.35);
  });
}

// ---------- SOZLAMALAR: SCREENSHOT BLOK / STEALTH READ ----------
async function toggleScreenshotBlock() {
  if (!activeChat) return;
  const next = !activeChat.settings.screenshotBlock;
  activeChat.settings.screenshotBlock = next;
  document.getElementById("ssBtn").classList.toggle("on", next);
  next ? ScreenshotGuard.enable() : ScreenshotGuard.disable();
  await API.patch(`/api/chats/${activeChat.id}/settings`, { screenshotBlock: next });
  showToast(next ? "🛡️ Skrinshot cheklovi yoqildi (to'liq kafolat emas, to'sqinlik)" : "Skrinshot cheklovi o'chirildi");
}

async function toggleStealthRead() {
  if (!activeChat) return;
  const next = !activeChat.settings.stealthRead;
  activeChat.settings.stealthRead = next;
  document.getElementById("stealthBtn").classList.toggle("on", next);
  await API.patch(`/api/chats/${activeChat.id}/settings`, { stealthRead: next });
  showToast(next ? "👻 Sharpa o'qish yoqildi: endi 'O'qildi' belgisi ko'rinmaydi" : "Sharpa o'qish o'chirildi");
}

// ---------- CHATNI QAYTARIB BO'LMAYDIGAN DARAJADA O'CHIRISH ----------
async function deleteActiveChat() {
  if (!activeChat) return;
  if (!confirm("Chat va barcha xabarlar/medialar QAYTARIB BO'LMAYDIGAN darajada o'chiriladi. Davom etasizmi?")) return;
  try {
    await API.delete(`/api/chats/${activeChat.id}`);
    GhostStore.unmark(activeChat.id);
    clearInterval(pollTimer);
    activeChat = null;
    document.getElementById("activeChat").style.display = "none";
    document.getElementById("emptyState").style.display = "flex";
    document.getElementById("app").classList.remove("chat-open");
    await loadChats();
    showToast("Chat butunlay o'chirildi");
  } catch (err) { showToast(err.message); }
}

// ---------- MOBIL: CHATDAN ORQAGA (chatlar ro'yxatiga) QAYTISH ----------
function closeActiveChatMobile() {
  clearInterval(pollTimer);
  activeChat = null;
  document.getElementById("app").classList.remove("chat-open");
}
