"use client";

import { useEffect, useRef, useState } from "react";

type Script = { src: string; fn: string; dur: number; invoker: string };
type Frame = { at: number; dur: number; block: number; render: number; scripts: Script[] };
type LongTask = { at: number; dur: number };

const short = (url: string) => {
  try {
    const u = new URL(url, location.href);
    return (u.pathname.split("/").slice(-2).join("/") || u.pathname).slice(-60);
  } catch {
    return url.slice(-60);
  }
};

/** The numbers behind "it feels janky": frame pacing, long animation frames with the scripts inside them, long tasks, slow taps, layout shift. */
export function PerfProbe() {
  const frames = useRef<Frame[]>([]);
  const tasks = useRef<LongTask[]>([]);
  const slowTaps = useRef<Array<{ name: string; dur: number; delay: number }>>([]);
  const shift = useRef(0);
  const deltas = useRef<number[]>([]);
  const [open, setOpen] = useState(false);
  const [fps, setFps] = useState(0);
  const [worst, setWorst] = useState(0);
  const [, tick] = useState(0);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let n = 0;
    let w = 0;
    const loop = (t: number) => {
      const d = t - last;
      last = t;
      if (d < 1000) {
        deltas.current.push(d);
        if (deltas.current.length > 2000) deltas.current.shift();
        acc += d;
        n += 1;
        w = Math.max(w, d);
        if (acc >= 1000) {
          setFps(Math.round((n * 1000) / acc));
          setWorst(Math.round(w));
          acc = 0;
          n = 0;
          w = 0;
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const watch = (type: string, cb: (e: PerformanceEntry & Record<string, unknown>) => void, extra?: PerformanceObserverInit) => {
      try {
        const po = new PerformanceObserver((list) => list.getEntries().forEach((e) => cb(e as PerformanceEntry & Record<string, unknown>)));
        po.observe({ type, buffered: true, ...extra } as PerformanceObserverInit);
        return po;
      } catch {
        return null;
      }
    };
    const observers = [
      watch("long-animation-frame", (e) => {
        const scripts = ((e.scripts as Array<Record<string, unknown>>) ?? []).map((s) => ({
          src: short(String(s.sourceURL ?? "")),
          fn: String(s.sourceFunctionName ?? ""),
          dur: Math.round(Number(s.duration ?? 0)),
          invoker: String(s.invoker ?? "").slice(0, 60),
        }));
        frames.current.push({ at: Math.round(e.startTime), dur: Math.round(e.duration), block: Math.round(Number(e.blockingDuration ?? 0)), render: Math.round(Number(e.renderStart ?? 0) ? e.startTime + e.duration - Number(e.renderStart) : 0), scripts });
        if (frames.current.length > 300) frames.current.shift();
      }),
      watch("longtask", (e) => {
        tasks.current.push({ at: Math.round(e.startTime), dur: Math.round(e.duration) });
        if (tasks.current.length > 300) tasks.current.shift();
      }),
      watch("event", (e) => {
        if (e.duration >= 120) slowTaps.current.push({ name: e.name, dur: Math.round(e.duration), delay: Math.round(Number(e.processingStart ?? 0) - e.startTime) });
      }, { durationThreshold: 120 } as PerformanceObserverInit),
      watch("layout-shift", (e) => {
        if (!e.hadRecentInput) shift.current += Number(e.value ?? 0);
      }),
    ];
    return () => {
      cancelAnimationFrame(raf);
      observers.forEach((o) => o?.disconnect());
    };
  }, []);

  const report = () => {
    const f = frames.current;
    const t = tasks.current;
    const d = [...deltas.current].sort((a, b) => a - b);
    const q = (p: number) => (d.length ? d[Math.min(d.length - 1, Math.floor(d.length * p))].toFixed(0) : "-");
    const slow = d.filter((x) => x > 33.4).length;
    const bySource = new Map<string, number>();
    for (const fr of f) for (const s of fr.scripts) bySource.set(s.src || "(inline)", (bySource.get(s.src || "(inline)") ?? 0) + s.dur);
    const top = [...bySource.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    const worstFrames = [...f].sort((a, b) => b.dur - a.dur).slice(0, 6);
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const conn = (navigator as unknown as { connection?: { effectiveType?: string; saveData?: boolean } }).connection;
    const lines = [
      `PERF ${location.pathname}  ${new Date().toISOString()}`,
      `device: cores ${navigator.hardwareConcurrency} mem ${(navigator as unknown as { deviceMemory?: number }).deviceMemory ?? "?"}GB dpr ${devicePixelRatio} viewport ${innerWidth}x${innerHeight} net ${conn?.effectiveType ?? "?"}${conn?.saveData ? " saveData" : ""}`,
      `ua: ${navigator.userAgent}`,
      `dom nodes ${document.getElementsByTagName("*").length}  sw controller ${navigator.serviceWorker?.controller ? "yes" : "no"}  nav ttfb ${nav ? Math.round(nav.responseStart) : "?"}ms dcl ${nav ? Math.round(nav.domContentLoadedEventEnd) : "?"}ms`,
      `frames ${d.length}: p50 ${q(0.5)}ms p95 ${q(0.95)}ms p99 ${q(0.99)}ms, over 33ms: ${slow} (${d.length ? Math.round((100 * slow) / d.length) : 0}%)`,
      `long tasks ${t.length}, blocking ${t.reduce((a, x) => a + Math.max(0, x.dur - 50), 0)}ms, worst ${Math.max(0, ...t.map((x) => x.dur))}ms`,
      `long animation frames ${f.length}, worst ${Math.max(0, ...f.map((x) => x.dur))}ms`,
      `layout shift ${shift.current.toFixed(3)}`,
      `slow taps (>=120ms): ${slowTaps.current.slice(-8).map((x) => `${x.name} ${x.dur}ms (waited ${x.delay}ms)`).join("; ") || "none"}`,
      `script time by file: ${top.map(([s, ms]) => `${s} ${ms}ms`).join(" | ") || "-"}`,
      `worst frames: ${worstFrames.map((fr) => `${fr.dur}ms [render ${fr.render}ms] ${fr.scripts.slice(0, 2).map((s) => `${s.src}:${s.fn || s.invoker} ${s.dur}ms`).join(", ")}`).join("  //  ") || "-"}`,
    ];
    return lines.join("\n");
  };

  const [text, setText] = useState("");
  const show = () => {
    setText(report());
    setOpen(true);
    tick((n) => n + 1);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(report());
    } catch {
      /* the text on screen can be selected instead */
    }
  };
  const clear = () => {
    frames.current = [];
    tasks.current = [];
    slowTaps.current = [];
    deltas.current = [];
    shift.current = 0;
    setText(report());
  };

  return (
    <div style={{ position: "fixed", left: 0, right: 0, top: 6, zIndex: 2147483000, font: "11px/1.3 ui-monospace, monospace", display: "flex", flexDirection: "column", alignItems: "center", pointerEvents: "none" }}>
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : show())}
        style={{ background: fps && fps < 45 ? "#b3261e" : "#1d1a17", color: "#fff", border: 0, borderRadius: 999, padding: "5px 10px", opacity: 0.92, pointerEvents: "auto" }}
      >
        perf {fps || "…"}fps · worst {worst}ms
      </button>
      {open && (
        <div style={{ marginTop: 6, width: "calc(100vw - 16px)", maxHeight: "70vh", overflow: "auto", background: "rgba(20,18,16,.96)", color: "#e8e4de", borderRadius: 12, padding: 10, pointerEvents: "auto" }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <button type="button" onClick={copy} style={{ background: "#fff", color: "#000", border: 0, borderRadius: 8, padding: "6px 10px" }}>Copy report</button>
            <button type="button" onClick={show} style={{ background: "#444", color: "#fff", border: 0, borderRadius: 8, padding: "6px 10px" }}>Refresh</button>
            <button type="button" onClick={clear} style={{ background: "#444", color: "#fff", border: 0, borderRadius: 8, padding: "6px 10px" }}>Clear</button>
          </div>
          <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0, userSelect: "text" }}>{text}</pre>
        </div>
      )}
    </div>
  );
}
