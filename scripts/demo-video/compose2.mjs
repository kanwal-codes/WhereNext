// Safer composer: each segment rendered alone (speed ramp + beat punch + push-in), joined with white fillers, then overlay PNGs + beat added in one light pass.
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { SEGMENTS, TOTAL, FPS } from "./timeline.mjs";
mkdirSync("seg", { recursive: true });
const f4 = n => n.toFixed(4);
const ENC = ["-c:v", "libx264", "-crf", "14", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-r", String(FPS), "-video_track_timescale", "30000"];
const run = a => execFileSync("ffmpeg", ["-loglevel", "error", "-y", ...a], { stdio: "inherit" });
const list = []; let cursor = 0, k = 0;
const filler = (secs, name) => { run(["-f", "lavfi", "-i", `color=c=white:s=1920x1080:r=${FPS}:d=${secs}`, ...ENC, name]); list.push(name); };
SEGMENTS.forEach((s, i) => {
  if (s.t > cursor) filler(s.t - cursor, `seg/fill${k++}.mp4`);
  const z = s.zoom ?? { z0: 1, z1: 1, fx: 0.5, fy: 0.5 };
  const D = s.d, ratio = D / (s.b - s.a);
  const ease = `(0.5-0.5*cos(3.14159265*min(1,t/${D})))`;
  const Z = `((${z.z0}+(${z.z1}-${z.z0})*${ease})*(1+0.045*pow(max(0,1-t/0.35),2)))`;
  const vf = `trim=start=${f4(s.a)}:end=${f4(s.b)},setpts=(PTS-STARTPTS)*${f4(ratio)},fps=${FPS},scale=w='1920*${Z}':h='1080*${Z}':eval=frame:flags=bicubic,crop=1920:1080:x='(iw-1920)*${z.fx}':y='(ih-1080)*${z.fy}',setsar=1,format=yuv420p,tpad=stop_mode=clone:stop_duration=1,trim=duration=${D},setpts=PTS-STARTPTS`;
  const name = `seg/s${i}.mp4`;
  run(["-i", s.file, "-vf", vf, "-t", String(D), ...ENC, name]); list.push(name);
  cursor = s.t + s.d; console.log("segment", s.id, "ok");
});
if (cursor < TOTAL) filler(TOTAL - cursor, `seg/fill${k++}.mp4`);
writeFileSync("seg/list.txt", list.map(f => `file '${f.replace("seg/", "")}'`).join("\n") + "\n");
run(["-f", "concat", "-safe", "0", "-i", "seg/list.txt", "-c", "copy", "base.mp4"]);
run(["-i", "base.mp4", "-framerate", String(FPS), "-i", "ov/%05d.png", "-i", "beat.wav",
  "-filter_complex", `[0:v][1:v]overlay=format=auto:shortest=1,format=yuv420p[v];[2:a]atrim=0:${TOTAL},asetpts=PTS-STARTPTS,volume=-1.5dB,afade=t=out:st=${TOTAL - 2}:d=2[a]`,
  "-map", "[v]", "-map", "[a]", "-t", String(TOTAL), "-c:v", "libx264", "-crf", "17", "-preset", "medium", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "where-next-demo-v2.mp4"]);
console.log("ok");
