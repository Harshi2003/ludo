// Tiny WebAudio synth: no audio assets, every sound is generated.
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;

try {
  muted = localStorage.getItem("ludo:muted") === "1";
} catch {}

function ac() {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function tone(freq: number, dur: number, type: OscillatorType = "sine", gain = 0.12, slideTo?: number, delay = 0) {
  const c = ac();
  if (!c || muted || !master) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise(dur: number, gain = 0.15, freq = 1200, delay = 0) {
  const c = ac();
  if (!c || muted || !master) return;
  const t = c.currentTime + delay;
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = freq;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(master);
  src.start(t);
}

export const sfx = {
  roll() {
    for (let i = 0; i < 7; i++) noise(0.05, 0.25, 2200 + Math.random() * 1500, i * 0.075 + Math.random() * 0.02);
    tone(180, 0.12, "triangle", 0.08, undefined, 0.6);
  },
  hop(i = 0) {
    tone(380 + i * 35, 0.09, "triangle", 0.07, 520 + i * 35);
  },
  capture() {
    tone(160, 0.55, "sawtooth", 0.16, 38);
    noise(0.45, 0.35, 700);
    tone(90, 0.6, "sine", 0.22, 40, 0.02);
  },
  shield() {
    tone(900, 0.25, "sine", 0.08, 1400);
    tone(1350, 0.3, "sine", 0.05, 1800, 0.05);
  },
  tile(good: boolean) {
    if (good) [784, 988, 1318].forEach((f, i) => tone(f, 0.35, "sine", 0.07, undefined, i * 0.06));
    else [330, 262, 196].forEach((f, i) => tone(f, 0.3, "square", 0.04, undefined, i * 0.07));
  },
  ability() {
    tone(260, 0.35, "sine", 0.12, 880);
    noise(0.3, 0.12, 3000, 0.05);
  },
  ultimate() {
    [196, 247, 294, 392, 494, 587].forEach((f, i) => tone(f, 0.9, "sawtooth", 0.035, undefined, i * 0.05));
    tone(60, 1.2, "sine", 0.25, 30);
    noise(1, 0.18, 400);
  },
  turn() {
    tone(660, 0.12, "sine", 0.04, 880);
  },
  win() {
    [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => tone(f, 0.45, "triangle", 0.09, undefined, i * 0.13));
  },
  click() {
    tone(1200, 0.04, "square", 0.025);
  },
};

export const isMuted = () => muted;
export function setMuted(m: boolean) {
  muted = m;
  try {
    localStorage.setItem("ludo:muted", m ? "1" : "0");
  } catch {}
}
