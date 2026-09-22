/**
 * Spoken names when a country is taught (Web Speech API, offline on most
 * devices). Silent no-op where unsupported. The toggle is remembered.
 */
const KEY = 'worldbeat.voice';
let enabled = true;
try {
  enabled = localStorage.getItem(KEY) !== 'off';
} catch {
  /* ignore */
}

let voice: SpeechSynthesisVoice | null = null;
function pickVoice(): void {
  const vs = window.speechSynthesis?.getVoices() ?? [];
  voice = vs.find((v) => v.lang === 'es-ES') ?? vs.find((v) => v.lang.startsWith('es')) ?? null;
}
if ('speechSynthesis' in window) {
  pickVoice();
  window.speechSynthesis.addEventListener?.('voiceschanged', pickVoice);
}

export const voiceEnabled = (): boolean => enabled;

export function setVoice(on: boolean): void {
  enabled = on;
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    /* ignore */
  }
  if (!on) window.speechSynthesis?.cancel();
}

export function speak(text: string): void {
  if (!enabled || !('speechSynthesis' in window)) return;
  const s = window.speechSynthesis;
  s.cancel();
  const u = new SpeechSynthesisUtterance(text.toLowerCase());
  u.lang = 'es-ES';
  if (voice) u.voice = voice;
  u.rate = 1.1;
  u.volume = 0.9;
  s.speak(u);
}

export function silence(): void {
  window.speechSynthesis?.cancel();
}
