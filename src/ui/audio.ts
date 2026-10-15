// Áudio básico sintetizado (Web Audio), sem arquivos externos.
export type SoundName = 'click' | 'place' | 'error' | 'good' | 'alert' | 'capture' | 'lost';

let ctx: AudioContext | null = null;
let volume = 0.35;

function ac(): AudioContext | null {
  if (!ctx) {
    try {
      ctx = new AudioContext();
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

export function setVolume(v: number) {
  volume = Math.max(0, Math.min(1, v));
}

function tone(freq: number, start: number, dur: number, type: OscillatorType, gain: number) {
  const a = ac();
  if (!a || volume <= 0) return;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.value = freq;
  const t0 = a.currentTime + start;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain * volume, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(a.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

export function playSound(name: SoundName) {
  switch (name) {
    case 'click':
      tone(880, 0, 0.05, 'square', 0.08);
      break;
    case 'place':
      tone(330, 0, 0.12, 'triangle', 0.3);
      tone(220, 0.06, 0.15, 'triangle', 0.25);
      break;
    case 'error':
      tone(160, 0, 0.18, 'sawtooth', 0.15);
      break;
    case 'good':
      tone(660, 0, 0.12, 'sine', 0.25);
      tone(990, 0.1, 0.18, 'sine', 0.22);
      break;
    case 'capture':
      tone(523, 0, 0.12, 'triangle', 0.3);
      tone(659, 0.1, 0.12, 'triangle', 0.3);
      tone(784, 0.2, 0.25, 'triangle', 0.3);
      break;
    case 'lost':
      tone(392, 0, 0.15, 'triangle', 0.3);
      tone(311, 0.14, 0.3, 'triangle', 0.3);
      break;
    case 'alert':
      tone(740, 0, 0.12, 'square', 0.12);
      tone(740, 0.18, 0.12, 'square', 0.12);
      break;
  }
}
