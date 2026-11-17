// The story, on a 120 BPM grid (1 beat = 0.5s, 1 bar = 2s). Every footage segment starts and ends on a beat.
import { readFileSync } from "node:fs";
const M = n => JSON.parse(readFileSync(`marks-${n}.json`, "utf8"));
export const m1 = M("f1"), m2 = M("f2"), m3 = M("f3");
export const TOTAL = 60, FPS = 30;

// footage segments: [file, srcStart, srcEnd, outStart, outDur, zoom?]
// zoom: { z0, z1, fx, fy }  focus point (0..1) stays fixed on screen while scaling z0 -> z1
export const SEGMENTS = [
  { id: "type",   file: "f1.mp4", a: m1.typeStart - 0.5, b: m1.enter1 + 0.4, t: 10, d: 4 },
  { id: "send",   file: "f1.mp4", a: m1.enter1 + 0.4,    b: m1.enter2 + 0.7, t: 14, d: 2 },
  { id: "wait",   file: "f1.mp4", a: m1.enter2 + 0.7,    b: m1.planVisible,  t: 16, d: 2 },
  { id: "reveal", file: "f1.mp4", a: m1.planVisible,     b: m1.added + 1.0,  t: 18, d: 6, zoom: { z0: 1.0, z1: 1.16, fx: 0.38, fy: 0.45 } },
  { id: "map",    file: "f2.mp4", a: m2.mapReady - 0.6,  b: m2.mapReady + 3.8, t: 24, d: 4, zoom: { z0: 1.0, z1: 1.12, fx: 0.7, fy: 0.45 } },
  { id: "plan",   file: "f2.mp4", a: m2.planReady - 0.5, b: m2.planReady + 6.2, t: 28, d: 4 },
  { id: "stay",   file: "f2.mp4", a: m2.stayReady - 0.4, b: m2.stayReady + 5.4, t: 32, d: 4, zoom: { z0: 1.0, z1: 1.1, fx: 0.4, fy: 0.6 } },
  { id: "disc",   file: "f2.mp4", a: m2.discoverReady - 0.7, b: m2.discoverReady + 5.5, t: 36, d: 4 },
  { id: "thread", file: "f3.mp4", a: m3.thread + 0.2,    b: m3.send + 0.35,  t: 40, d: 4 },
  { id: "gwait",  file: "f3.mp4", a: m3.send + 0.35,     b: m3.reply,        t: 44, d: 2 },
  { id: "reply",  file: "f3.mp4", a: m3.reply,           b: m3.reply + 3.2,  t: 46, d: 2, zoom: { z0: 1.0, z1: 1.14, fx: 0.4, fy: 0.62 } },
];
// source time -> output time for a segment id
export const out = (id, src) => { const s = SEGMENTS.find(x => x.id === id); return s.t + (src - s.a) * (s.d / (s.b - s.a)); };

export const ELAPSED = +(m1.planVisible - m1.enter2).toFixed(1); // real seconds Roam took, shown honestly
const tSend = out("send", m1.enter2), tPlan = 18; // stopwatch runs from the real Enter press to the plan appearing

export const CAPTIONS = [
  { t0: 10, t1: 13.5, label: "ONE SENTENCE", head: "Describe the trip like you'd text a friend." },
  { t0: 18, t1: 21.5, label: "IDEA → PLAN", badge: ELAPSED + "s", head: "A real 3-day plan. Built live." },
  { t0: 21.5, t1: 24, label: "REMEMBERS", head: "Destination, group size and pace, saved as you talk." },
  { t0: 24, t1: 28, label: "SEE IT", pain: "A dozen map tabs", head: "Every stop on one map." },
  { t0: 28, t1: 32, label: "STAY ORGANISED", pain: "Notes app chaos", head: "Day by day, in order." },
  { t0: 32, t1: 36, label: "SLEEP NEAR IT", pain: "50 booking tabs", head: "Stays near the plan." },
  { t0: 36, t1: 40, label: "FIND MORE", pain: "Endless scrolling", head: "Top sights, one tap to add." },
  { t0: 40, t1: 44, label: "TOGETHER", pain: "Group chat chaos", head: "Same trip. Same page." },
  { t0: 44, t1: 48, label: "ASK ROAM", head: "Ask @Roam. The whole group gets the answer." },
];
export const STOPWATCH = { t0: tSend, t1: tPlan, elapsed: ELAPSED };
export const FLASHES = [{ t: 10, d: 0.3 }, { t: 18, d: 0.35 }, { t: 24, d: 0.12 }, { t: 28, d: 0.12 }, { t: 32, d: 0.12 }, { t: 36, d: 0.12 }, { t: 40, d: 0.12 }, { t: 46, d: 0.15 }, { t: 54, d: 0.4 }];
