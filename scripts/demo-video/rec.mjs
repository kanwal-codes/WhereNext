// Minimal screen recorder: CDP screencast frames (JPEG, 1920x1080) with timestamps -> constant-30fps mp4 via ffmpeg.
import { mkdirSync, writeFileSync, rmSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
export async function startRec(page, name) {
  const dir = `frames-${name}`; rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  const frames = []; let n = 0;
  cdp.on("Page.screencastFrame", async f => {
    const file = `${dir}/${String(n++).padStart(6, "0")}.jpg`;
    writeFileSync(file, Buffer.from(f.data, "base64")); frames.push({ file, t: performance.now() / 1000 });
    cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  const t0 = performance.now() / 1000;
  return {
    now: () => performance.now() / 1000 - (frames[0]?.t ?? t0),
    async stop(out = `${name}.mp4`) {
      await cdp.send("Page.stopScreencast").catch(() => {});
      await new Promise(r => setTimeout(r, 300));
      const base = f => f.file.split("/").pop();
      const list = frames.map((f, i) => `file '${base(f)}'\nduration ${(i < frames.length - 1 ? frames[i + 1].t - f.t : Math.max(0.1, performance.now() / 1000 - f.t)).toFixed(4)}`).join("\n") + `\nfile '${base(frames.at(-1))}'\n`;
      writeFileSync(`${dir}/list.txt`, list);
      execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", `${dir}/list.txt`, "-vf", "fps=30,format=yuv420p", "-c:v", "libx264", "-crf", "16", "-preset", "medium", out]);
      return { out, frames: frames.length };
    },
  };
}
