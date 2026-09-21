/* Tiny WebAudio synth for arcade blips. Safe to call from anywhere client-side. */

let ctx: AudioContext | null = null;
let muted = false;

function ac(): AudioContext | null {
  try {
    if (typeof window === "undefined") return null;
    if (!ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

export function setMuted(m: boolean) {
  muted = m;
  try {
    localStorage.setItem("ta:muted", m ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function initMuted() {
  try {
    muted = localStorage.getItem("ta:muted") === "1";
  } catch {
    /* ignore */
  }
}

function blip(
  freq: number,
  dur: number,
  type: OscillatorType,
  vol: number,
  slideTo = 0,
  delay = 0
) {
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo > 0) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g);
  g.connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

export function sfx(name: string) {
  if (muted) return;
  try {
    switch (name) {
      case "move":
        blip(210, 0.03, "square", 0.035);
        break;
      case "rotate":
        blip(340, 0.045, "square", 0.05, 480);
        break;
      case "lock":
        blip(150, 0.06, "triangle", 0.08, 90);
        break;
      case "hard":
        blip(120, 0.07, "sawtooth", 0.08, 320);
        break;
      case "hold":
        blip(260, 0.05, "square", 0.05);
        break;
      case "clear":
        [523, 659, 784, 1046].forEach((f, i) => blip(f, 0.09, "square", 0.06, 0, i * 0.05));
        break;
      case "garbage":
        blip(90, 0.28, "sawtooth", 0.1, 40);
        blip(60, 0.3, "square", 0.08, 30, 0.05);
        break;
      case "topout":
        [400, 300, 200, 120].forEach((f, i) => blip(f, 0.14, "sawtooth", 0.08, f * 0.6, i * 0.09));
        break;
      case "tick":
        blip(880, 0.06, "square", 0.05);
        break;
      case "go":
        blip(1046, 0.16, "square", 0.07);
        break;
      case "join":
        blip(440, 0.07, "square", 0.05);
        blip(660, 0.09, "square", 0.05, 0, 0.07);
        break;
      case "win":
        [523, 659, 784, 1046, 1318].forEach((f, i) => blip(f, 0.14, "square", 0.07, 0, i * 0.09));
        break;
      case "over":
        [392, 330, 262, 196].forEach((f, i) => blip(f, 0.16, "triangle", 0.08, f * 0.8, i * 0.11));
        break;
      case "error":
        blip(140, 0.12, "square", 0.06, 90);
        break;
    }
  } catch {
    /* audio not available */
  }
}
