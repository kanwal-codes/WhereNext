// Original 120 BPM track, synthesized sample by sample (no samples, nothing to license).
// Beat = 0.5s, bar = 2s. Sections (seconds):  0-8 tense intro, 8-10 silence+whoosh, 10-48 groove (impact at 18),
// 48-52 breakdown, 52-54 riser, 54-58 final groove, 58+ chime tail.
import { writeFileSync } from "node:fs";
const SR = 44100, T = 61, N = SR * T, BEAT = 0.5;
const L = new Float32Array(N), R = new Float32Array(N), SIDE = new Float32Array(N).fill(1);
let seed = 12345; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
const lpA = fc => 1 - Math.exp((-2 * Math.PI * fc) / SR);
const midi = n => 440 * 2 ** ((n - 69) / 12);
const put = (t0, sig, g = 1, pan = 0, side = false) => {
  const s = Math.floor(t0 * SR); const gl = g * (1 - Math.max(0, pan)), gr = g * (1 + Math.min(0, pan));
  for (let i = 0; i < sig.length && s + i < N; i++) { if (s + i < 0) continue; const v = sig[i] * (side ? SIDE[s + i] : 1); L[s + i] += v * gl; R[s + i] += v * gr; }
};
const dur = s => Math.floor(s * SR);
// ---- instruments (return Float32Array) ----
const kick = () => { const n = dur(0.45), o = new Float32Array(n); let ph = 0; for (let i = 0; i < n; i++) { const t = i / SR; ph += (2 * Math.PI * (46 + 110 * Math.exp(-t * 38))) / SR; o[i] = Math.sin(ph) * Math.exp(-t * 7.5) + (i < 40 ? 0.4 * rnd() : 0); } return o; };
const clap = (g = 1) => { const n = dur(0.28), o = new Float32Array(n); let a = 0, b = 0; for (let i = 0; i < n; i++) { const t = i / SR; const x = rnd(); a += lpA(3800) * (x - a); b += lpA(900) * (x - b); const bp = a - b; const burst = (t < 0.009 ? 1 : 0) + (t > 0.011 && t < 0.02 ? 1 : 0) + (t > 0.022 ? Math.exp(-(t - 0.022) * 20) : 0); o[i] = bp * burst * 1.6 * g; } return o; };
const hat = (open = false, g = 1) => { const n = dur(open ? 0.3 : 0.07), o = new Float32Array(n); let lp = 0; for (let i = 0; i < n; i++) { const t = i / SR; const x = rnd(); lp += lpA(7500) * (x - lp); o[i] = (x - lp) * Math.exp(-t * (open ? 14 : 70)) * 0.55 * g; } return o; };
const tick = (f = 1400, g = 1) => { const n = dur(0.05), o = new Float32Array(n); for (let i = 0; i < n; i++) { const t = i / SR; o[i] = Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 90) * 0.5 * g; } return o; };
const riser = (secs, up = true) => { const n = dur(secs), o = new Float32Array(n); let lp = 0; for (let i = 0; i < n; i++) { const p = i / n, q = up ? p : 1 - p; lp += lpA(250 + 9000 * q * q) * (rnd() - lp); o[i] = lp * (0.15 + 0.85 * q * q) * 1.4; } return o; };
const impact = () => { const n = dur(2.2), o = new Float32Array(n); let lp = 0, ph = 0; for (let i = 0; i < n; i++) { const t = i / SR; lp += lpA(2600 * Math.exp(-t * 3) + 120) * (rnd() - lp); ph += (2 * Math.PI * (38 + 60 * Math.exp(-t * 14))) / SR; o[i] = (Math.sin(ph) * Math.exp(-t * 2.2) * 1.1 + lp * Math.exp(-t * 3.2) * 1.2); } return o; };
const bass = (f, len = 0.45) => { const n = dur(len), o = new Float32Array(n); let lp = 0, ph = 0; for (let i = 0; i < n; i++) { const t = i / SR; ph += f / SR; const saw = 2 * (ph % 1) - 1; lp += lpA(180 + 900 * Math.exp(-t * 9)) * (saw - lp); const att = Math.min(1, t / 0.006); o[i] = (lp * 0.9 + Math.sin(2 * Math.PI * f * t) * 0.7) * Math.exp(-t * 3.2) * att; } return o; };
const pad = (notes, len, g = 1) => { const n = dur(len), o = new Float32Array(n); const ph = notes.flatMap(m => [0, 0, 0].map(() => 0)); const fs = notes.flatMap(m => [midi(m) * 0.997, midi(m), midi(m) * 1.003]); let lp = 0; for (let i = 0; i < n; i++) { const t = i / SR; let s = 0; for (let k = 0; k < fs.length; k++) { ph[k] += fs[k] / SR; s += 2 * (ph[k] % 1) - 1; } lp += lpA(1100) * (s / fs.length - lp); const env = Math.min(1, t / 0.7) * Math.min(1, (len - t) / 0.7); o[i] = lp * env * g; } return o; };
const pluck = (f, g = 1) => { const n = dur(0.5), o = new Float32Array(n); let ph = 0, lp = 0; for (let i = 0; i < n; i++) { const t = i / SR; ph += f / SR; const tri = 4 * Math.abs((ph % 1) - 0.5) - 1; lp += lpA(1200 + 5000 * Math.exp(-t * 18)) * (tri + 0.3 * Math.sign(Math.sin(2 * Math.PI * ph)) - lp); o[i] = lp * Math.exp(-t * 8) * g * Math.min(1, t / 0.003); } return o; };
const bell = (f, secs = 2.8, g = 1) => { const n = dur(secs), o = new Float32Array(n); for (let i = 0; i < n; i++) { const t = i / SR; o[i] = (Math.sin(2 * Math.PI * f * t) + 0.45 * Math.sin(2 * Math.PI * f * 2.76 * t) * Math.exp(-t * 3) + 0.25 * Math.sin(2 * Math.PI * f * 5.4 * t) * Math.exp(-t * 6)) * Math.exp(-t * 1.5) * g; } return o; };

// ---- score ----
const chords = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]; // Am F C G (pad voicing)
const roots = [33, 29, 36, 31]; // A1 F1 C2 G1 (bass)
const arpTones = [[69, 72, 76, 81], [65, 69, 72, 77], [72, 76, 79, 84], [67, 71, 74, 79]];
const K = kick(), C = clap(), HC = hat(false), HO = hat(true), KT = [];
const inGroove = t => (t >= 10 && t < 48) || (t >= 54 && t < 58);
// 1) kick (also drives the sidechain duck)
for (let t = 10; t < 48; t += BEAT) KT.push(t);
for (let t = 54; t < 58; t += BEAT) KT.push(t);
KT.push(18); // extra thump with the impact
for (const t of KT) { put(t, K, 0.95); const s = Math.floor(t * SR); for (let i = 0; i < SR * 0.3 && s + i < N; i++) SIDE[s + i] = Math.min(SIDE[s + i], 0.35 + 0.65 * (1 - Math.exp(-(i / SR) / 0.09))); }
// 2) claps on 2 and 4, hats on offbeats, a bar-end fill every 4 bars
for (let b = 0; b * 2 < T; b++) {
  const t0 = b * 2;
  if (inGroove(t0)) {
    put(t0 + BEAT, C, 0.5, 0.1); put(t0 + 3 * BEAT, C, 0.5, -0.1);
    for (let k = 0; k < 4; k++) put(t0 + k * BEAT + BEAT / 2, HC, 0.55, k % 2 ? 0.25 : -0.25);
    put(t0 + 1.75, HC, 0.4); put(t0 + 3 * BEAT + 0.25, HC, 0.35);
    if (b % 4 === 3) { for (let k = 0; k < 4; k++) put(t0 + 1.5 + k * 0.125, C, 0.25 + 0.12 * k, 0); }
  }
}
// 3) bass, pad, arp per bar in groove + breakdown
for (let b = 0; b * 2 < T; b++) {
  const t0 = b * 2, ci = b % 4;
  const groove = inGroove(t0), breakdown = t0 >= 48 && t0 < 54, tail = t0 >= 58;
  if (groove) {
    const f = midi(roots[ci]);
    for (const [o, len] of [[0, 0.45], [0.75, 0.2], [1.0, 0.45], [1.75, 0.2]]) put(t0 + o, bass(f, len), 0.62, 0, true);
    put(t0, pad(chords[ci], 2.1, 0.5), 0.32, 0, true);
  }
  if (groove || breakdown) {
    const at = arpTones[ci]; const g = breakdown ? 0.34 : (t0 >= 10 && t0 < 18 ? 0.22 : 0.3);
    const pat = breakdown ? [0, 1, 2, 3, 2, 1, 2, 3] : [0, 2, 1, 3, 2, 1, 3, 2];
    for (let k = 0; k < 8; k++) put(t0 + k * 0.25, pluck(midi(at[pat[k]] - 12 + 12), 1), g, k % 2 ? 0.35 : -0.35, true);
    if (breakdown) put(t0, pad(chords[ci], 2.1, 0.7), 0.4);
  }
  if (tail && t0 < 60) put(t0, pad(chords[ci], 3, 0.6), 0.3);
}
// 4) intro: drone, ticks, heartbeat, snare roll, riser
put(0, pad([33, 40, 45], 8.2, 1), 0.35);
for (let t = 2; t < 8; t += BEAT) put(t, tick(t < 4 ? 1100 : 1500, 0.5 + (t / 8) * 0.5), 0.6, (Math.floor(t / BEAT) % 2) * 0.5 - 0.25);
for (let t = 4; t < 8; t += BEAT / 2) put(t, HC, 0.3 + (t - 4) * 0.12, 0.2);
for (let t = 0; t < 8; t += 1) put(t, (() => { const k = kick(); return k.map(v => v * 0.5); })(), t < 4 ? 0.25 : 0.4); // soft heartbeat on the beat
for (let t = 6; t < 8; t += 0.125) put(t, C, 0.12 + (t - 6) * 0.2, 0);
put(4.5, riser(3.5), 0.38);
// 5) 8-10 silence with a pad breath then whoosh into the drop
put(8.4, pad([57, 64, 69], 1.8, 0.8), 0.22); put(9, riser(1.0), 0.45);
put(8, tick(900, 1), 0.5);
// 6) reveal impact at 18, section crash feel
put(18, impact(), 0.8); put(18, HO, 0.9);
for (let b = 0; b * 2 < T; b++) { const t0 = b * 2; if (t0 >= 20 && t0 < 48 && b % 8 === 0) put(t0, HO, 0.6); }
// 7) breakdown end riser into final hit, chime tail
put(50, riser(4), 0.32); put(54, impact(), 0.9); put(54, HO, 1);
for (const [t, m] of [[58, 81], [58.5, 84], [59, 88]]) put(t, bell(midi(m), 2.6, 0.5), 0.3, t % 1 ? 0.4 : -0.4);
put(58, pad([57, 60, 64, 72], 3.0, 1), 0.25);
// ---- master: soft clip, normalise, fades ----
let peak = 0; for (let i = 0; i < N; i++) { L[i] = Math.tanh(L[i] * 1.25); R[i] = Math.tanh(R[i] * 1.25); peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i])); }
const g = 0.9 / peak; const fadeOut = dur(2.0);
const pcm = Buffer.alloc(N * 4);
for (let i = 0; i < N; i++) { const f = i > N - fadeOut ? (N - i) / fadeOut : 1; pcm.writeInt16LE(Math.round(L[i] * g * f * 32767), i * 4); pcm.writeInt16LE(Math.round(R[i] * g * f * 32767), i * 4 + 2); }
const hdr = Buffer.alloc(44); hdr.write("RIFF", 0); hdr.writeUInt32LE(36 + pcm.length, 4); hdr.write("WAVEfmt ", 8); hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(2, 22); hdr.writeUInt32LE(SR, 24); hdr.writeUInt32LE(SR * 4, 28); hdr.writeUInt16LE(4, 32); hdr.writeUInt16LE(16, 34); hdr.write("data", 36); hdr.writeUInt32LE(pcm.length, 40);
writeFileSync("beat.wav", Buffer.concat([hdr, pcm]));
console.log("beat.wav", T + "s", "peak", peak.toFixed(2));
