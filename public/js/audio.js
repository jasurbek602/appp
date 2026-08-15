/**
 * OVOZLI XABAR + "OVOZNI O'ZGARTIRISH" (Pitch Shift)
 *
 * Halol texnik izoh: brauzerda tempo(tezlik)ni o'zgartirmasdan faqat
 * balandlikni (pitch) o'zgartirish uchun "phase vocoder" kabi murakkab
 * algoritm kerak (masalan Tone.js kutubxonasidagi PitchShift). Bu yerda
 * soddaroq, lekin ko'plab messenger'larda ham ishlatiladigan usul
 * qo'llanildi: audio buferni boshqa playbackRate bilan qayta render
 * qilish (OfflineAudioContext) - bu ovozni "baland/nozik" yoki
 * "past/qalin" qiladi, tezligi ozgina o'zgaradi (masalan chipmunk yoki
 * "chuqur ovoz" effekti). Foydalanuvchiga shu farq oldindan tinglatiladi.
 */
const VoiceRecorder = {
  mediaRecorder: null,
  chunks: [],
  stream: null,

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.chunks = [];
    this.mediaRecorder = new MediaRecorder(this.stream);
    this.mediaRecorder.ondataavailable = (e) => this.chunks.push(e.data);
    this.mediaRecorder.start();
  },

  async stop() {
    return new Promise((resolve) => {
      this.mediaRecorder.onstop = () => {
        this.stream.getTracks().forEach((t) => t.stop());
        resolve(new Blob(this.chunks, { type: "audio/webm" }));
      };
      this.mediaRecorder.stop();
    });
  },
};

/**
 * pitchFactor: 1 = o'zgarishsiz, >1 = balandroq/nozikroq ovoz,
 * <1 = pastroq/qalinroq ovoz. Masalan 1.4 yoki 0.75.
 */
async function applyPitchShift(blob, pitchFactor = 1) {
  if (pitchFactor === 1) return blob;

  const arrayBuffer = await blob.arrayBuffer();
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const audioCtx = new AudioCtx();
  const decoded = await audioCtx.decodeAudioData(arrayBuffer);

  const offlineCtx = new OfflineAudioContext(
    decoded.numberOfChannels,
    Math.ceil(decoded.length / pitchFactor),
    decoded.sampleRate
  );
  const source = offlineCtx.createBufferSource();
  source.buffer = decoded;
  source.playbackRate.value = pitchFactor;
  source.connect(offlineCtx.destination);
  source.start(0);

  const rendered = await offlineCtx.startRendering();
  return bufferToWavBlob(rendered);
}

// OfflineAudioContext natijasini .wav Blob'ga aylantirish
function bufferToWavBlob(buffer) {
  const numChannels = buffer.numberOfChannels;
  const length = buffer.length * numChannels * 2 + 44;
  const arrBuf = new ArrayBuffer(length);
  const view = new DataView(arrBuf);
  const sampleRate = buffer.sampleRate;

  function writeStr(offset, str) {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  }

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + buffer.length * numChannels * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, buffer.length * numChannels * 2, true);

  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([arrBuf], { type: "audio/wav" });
}
