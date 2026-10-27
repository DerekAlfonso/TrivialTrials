// All sounds are synthesized with the Web Audio API: no audio files, no licensing questions.

export type SoundName = 'buzz' | 'ding' | 'strike' | 'reveal' | 'open' | 'fanfare' | 'tick' | 'timeUp' | 'join' | 'sad';

let ctx: AudioContext | null = null;
let muted = (() => {
  try {
    return localStorage.getItem('tt:muted') === '1';
  } catch {
    return false;
  }
})();
const listeners = new Set<() => void>();

function audio(): AudioContext | null {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

/** Browsers only allow audio after a user gesture; call this from a tap handler. */
export function unlockAudio() {
  const a = audio();
  if (a && a.state === 'suspended') void a.resume();
}

export function isAudioLocked() {
  return !ctx || ctx.state !== 'running';
}

export function isMuted() {
  return muted;
}

export function setMuted(m: boolean) {
  muted = m;
  try {
    localStorage.setItem('tt:muted', m ? '1' : '0');
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

export function onMuteChange(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

function tone(
  a: AudioContext,
  { freq, type = 'sine', start = 0, dur = 0.3, gain = 0.25, slideTo }: {
    freq: number;
    type?: OscillatorType;
    start?: number;
    dur?: number;
    gain?: number;
    slideTo?: number;
  },
) {
  const t0 = a.currentTime + start;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function noise(a: AudioContext, { start = 0, dur = 0.3, gain = 0.2, from = 400, to = 4000 }) {
  const t0 = a.currentTime + start;
  const buf = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource();
  src.buffer = buf;
  const filter = a.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(from, t0);
  filter.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  const g = a.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filter).connect(g).connect(a.destination);
  src.start(t0);
}

export function play(name: SoundName) {
  if (muted) return;
  const a = audio();
  if (!a || a.state !== 'running') return;
  switch (name) {
    case 'buzz':
      tone(a, { freq: 140, type: 'sawtooth', dur: 0.55, gain: 0.3 });
      tone(a, { freq: 147, type: 'square', dur: 0.55, gain: 0.15 });
      break;
    case 'ding':
      tone(a, { freq: 1318, dur: 0.9, gain: 0.25 });
      tone(a, { freq: 1976, dur: 0.7, gain: 0.12, start: 0.02 });
      break;
    case 'reveal':
      noise(a, { dur: 0.25, gain: 0.15, from: 600, to: 5000 });
      tone(a, { freq: 1046, dur: 0.6, gain: 0.22, start: 0.15 });
      tone(a, { freq: 1568, dur: 0.8, gain: 0.18, start: 0.22 });
      break;
    case 'strike':
      tone(a, { freq: 95, type: 'square', dur: 0.7, gain: 0.3 });
      tone(a, { freq: 100, type: 'sawtooth', dur: 0.7, gain: 0.25 });
      noise(a, { dur: 0.4, gain: 0.12, from: 200, to: 300 });
      break;
    case 'open':
      tone(a, { freq: 523, dur: 0.12, gain: 0.2 });
      tone(a, { freq: 784, dur: 0.18, gain: 0.2, start: 0.1 });
      break;
    case 'fanfare':
      [523, 659, 784, 1046].forEach((f, i) => tone(a, { freq: f, type: 'triangle', dur: 0.35, gain: 0.22, start: i * 0.13 }));
      tone(a, { freq: 1046, type: 'triangle', dur: 0.9, gain: 0.22, start: 0.55 });
      tone(a, { freq: 1318, type: 'triangle', dur: 0.9, gain: 0.15, start: 0.55 });
      break;
    case 'tick':
      tone(a, { freq: 1800, type: 'square', dur: 0.04, gain: 0.08 });
      break;
    case 'timeUp':
      tone(a, { freq: 880, type: 'square', dur: 0.8, gain: 0.2, slideTo: 220 });
      break;
    case 'join':
      tone(a, { freq: 660, dur: 0.12, gain: 0.15 });
      tone(a, { freq: 990, dur: 0.2, gain: 0.15, start: 0.08 });
      break;
    case 'sad':
      [392, 370, 349, 330].forEach((f, i) => tone(a, { freq: f, type: 'triangle', dur: 0.45, gain: 0.2, start: i * 0.35 }));
      break;
  }
}

export function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* unsupported */
  }
}
