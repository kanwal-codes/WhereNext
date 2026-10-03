import { CloudSun, Star } from "lucide-react";

/**
 * The things a trip is scattered across, drawn as the objects they are: a phone thread, browser
 * tabs, a boarding pass, a ticket stub, Polaroids, sticky notes, a receipt, a folded map. Each
 * fills the box its caller gives it (see `DESK` in ProblemScene); the paper and tape are in
 * globals.css (`.pc-*`).
 */

const Tape = ({ className = "" }: { className?: string }) => <span aria-hidden="true" className={`pc-tape ${className}`} />;

export function ChatThread() {
  const rows: [string, string, boolean][] = [
    ["K", "ROAD TRIP???", false],
    ["A", "bad bunny montreal oct 16", true],
    ["M", "i’m free 16–19", false],
    ["K", "wait who’s driving", false],
    ["A", "not it", true],
  ];
  return (
    <div className="pc-paper size-full overflow-hidden rounded-[1.1rem]">
      <div className="flex items-center gap-2 border-b border-border bg-surface px-3 py-2">
        <span className="flex -space-x-1.5">
          {["K", "A", "M"].map((n) => (
            <span key={n} className="grid size-5 place-items-center rounded-full border border-white bg-primary text-[9px] font-semibold text-primary-foreground">
              {n}
            </span>
          ))}
        </span>
        <span className="text-[11px] font-semibold">montreal??</span>
        <span className="ml-auto text-[10px] text-muted-foreground">47 unread</span>
      </div>
      <div className="space-y-1 px-2.5 py-2">
        {rows.map(([who, text, mine], i) => (
          <p key={i} className={`w-fit max-w-[88%] rounded-xl px-2.5 py-1 text-[11px] leading-snug ${mine ? "ml-auto bg-primary text-primary-foreground" : "bg-muted"}`}>
            {!mine && <span className="mr-1.5 font-semibold text-coral-ink">{who}</span>}
            {text}
          </p>
        ))}
      </div>
    </div>
  );
}

export function BrowserTabs() {
  return (
    <div className="pc-paper size-full overflow-hidden rounded-[0.9rem]">
      <div className="flex items-end gap-0.5 bg-muted px-2 pt-2">
        {[
          ["Airbnb · Old Montreal", true],
          ["10 things to do in MTL", false],
          ["VIA Rail", false],
        ].map(([label, on]) => (
          <span key={String(label)} className={`truncate rounded-t-lg px-2.5 py-1.5 text-[10px] ${on ? "w-[42%] bg-white font-medium" : "w-[29%] text-muted-foreground"}`}>
            {label}
          </span>
        ))}
        <span className="ml-1 pb-1.5 text-xs text-muted-foreground">+</span>
      </div>
      <div className="space-y-1.5 px-3 py-2.5">
        <p className="rounded-full bg-muted px-3 py-1 text-[10px] text-ink-soft">airbnb.com/rooms/…</p>
        <p className="font-display text-[13px] font-medium">Sunny loft steps from the Old Port</p>
        <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Star className="size-3 fill-coral text-coral" /> 4.7 · $186 / night · <span className="text-coral-ink">1 of 31 tabs</span>
        </p>
      </div>
    </div>
  );
}

export function BoardingPass() {
  return (
    <div className="pc-shadow size-full">
      <div className="pc-notch flex size-full flex-col justify-between bg-primary px-5 py-3.5 text-primary-foreground">
        <div className="flex items-center justify-between text-[9px] font-semibold tracking-[0.18em] uppercase opacity-80">
          <span>VIA Rail</span>
          <span>Boarding pass</span>
        </div>
        <p className="font-display text-[1.65rem] leading-none font-medium tracking-[-0.02em]">
          YTO <span className="mx-1 text-coral">→</span> YUL
        </p>
        <div>
          <p className="mb-1.5 text-[11px] opacity-80">Fri · 8:32 AM · Coach</p>
          <span className="pc-barcode block h-3.5 w-full" />
        </div>
      </div>
    </div>
  );
}

export function ConcertTicket() {
  return (
    <div className="pc-shadow size-full">
      <div className="pc-notch flex size-full items-stretch bg-coral-fill text-coral-fill-foreground">
        <div className="flex flex-1 flex-col justify-center px-5">
          <p className="font-display text-xl leading-none font-medium tracking-[-0.01em]">Bad Bunny</p>
          <p className="mt-1.5 text-[11px] opacity-90">Bell Centre · Oct 16 · 8 PM</p>
        </div>
        <div className="flex w-[3.4rem] flex-col items-center justify-center border-l border-dashed border-white/50 text-[8px] font-semibold tracking-[0.2em] uppercase [writing-mode:vertical-rl]">Admit one</div>
      </div>
    </div>
  );
}

export function Polaroid({ photo, caption }: { photo: string; caption: string }) {
  return (
    <div className="pc-paper relative size-full rounded-[3px] p-[0.55rem] pb-0">
      <Tape className="top-[-0.7rem] left-1/2 -ml-[2.3rem] rotate-[-4deg]" />
      <div className="h-[7.6rem] w-full bg-cover bg-center" style={{ backgroundImage: `url(${photo})` }} />
      <p className="font-hand pt-1.5 text-center text-[1.15rem] leading-none text-ink-soft">{caption}</p>
    </div>
  );
}

export function StickyNote({ text, tilt = 0 }: { text: string; tilt?: number }) {
  return (
    <div className="pc-sticky grid size-full place-items-center px-3 text-center" style={{ rotate: `${tilt}deg` }}>
      <p className="font-hand text-[1.45rem] leading-[1.05] text-ink">{text}</p>
    </div>
  );
}

export function Receipt() {
  return (
    <div className="pc-shadow size-full">
      <div className="pc-zigzag size-full bg-[oklch(0.985_0.006_85)] px-3.5 pt-3 pb-5 font-mono text-[10px] leading-[1.55] text-ink-soft">
        <p className="text-center text-[11px] font-semibold tracking-wide text-ink">BISTRO SAINT-PAUL</p>
        <p className="text-center text-muted-foreground">Old Montreal</p>
        <div className="my-1.5 border-t border-dashed border-ink/30" />
        <p className="flex justify-between"><span>Table for 4</span><span>Fri</span></p>
        <p className="flex justify-between"><span>Time</span><span>10:30 PM</span></p>
        <p className="flex justify-between"><span>Deposit</span><span>$40.00</span></p>
        <div className="my-1.5 border-t border-dashed border-ink/30" />
        <p className="text-center text-ink">your reservation<br />is confirmed</p>
      </div>
    </div>
  );
}

export function FoldedMap() {
  return (
    <div className="pc-paper relative size-full overflow-hidden rounded-[0.5rem]">
      <svg viewBox="0 0 240 160" className="size-full" aria-hidden="true">
        <rect width="240" height="160" fill="oklch(0.965 0.014 215)" />
        <path d="M0 118 C50 100 90 128 140 112 S210 96 240 104 L240 160 L0 160Z" fill="oklch(0.9 0.04 215)" />
        <path d="M150 14 q34 -10 58 8 q6 30 -22 38 q-34 6 -44 -16 q-4 -16 8 -30z" fill="oklch(0.93 0.045 150)" />
        <g stroke="white" strokeWidth="5" strokeLinecap="round" fill="none">
          <path d="M-4 40 L244 70" /><path d="M30 -4 L70 164" /><path d="M110 -4 L134 164" /><path d="M-4 92 L244 24" />
        </g>
        <g stroke="white" strokeWidth="2.5" strokeLinecap="round" fill="none"><path d="M0 66 L240 100" /><path d="M176 -4 L196 164" /><path d="M60 30 L170 8" /></g>
        <path d="M44 124 C70 98 96 112 118 80 S168 70 190 48" fill="none" stroke="oklch(0.55 0.16 35)" strokeWidth="2.2" strokeDasharray="1 6" strokeLinecap="round" />
        {[[44, 124], [118, 80], [190, 48]].map(([x, y], i) => (
          <g key={i} transform={`translate(${x} ${y})`}>
            <path d="M0 0 C-7 -9 -9 -13 -9 -17 a9 9 0 1 1 18 0 c0 4 -2 8 -9 17z" fill="oklch(0.64 0.175 36)" />
            <circle cy="-17" r="3.4" fill="white" />
          </g>
        ))}
      </svg>
      <span className="font-hand absolute right-2.5 bottom-1.5 text-[1.05rem] text-ink-soft">Old Port?</span>
    </div>
  );
}

export function WeatherCard() {
  return (
    <div className="pc-paper flex size-full items-center gap-3 rounded-[1.1rem] bg-gradient-to-br from-lagoon-soft to-white px-4">
      <CloudSun className="size-9 text-lagoon" strokeWidth={1.5} />
      <div>
        <p className="font-display text-3xl leading-none font-medium tracking-[-0.03em]">18°</p>
        <p className="mt-1 text-[11px] text-ink-soft">Saturday · cloudy</p>
      </div>
    </div>
  );
}

export function IndexCard() {
  return (
    <div className="pc-paper pc-lined relative size-full rounded-[3px] px-4 pt-2">
      <Tape className="top-[-0.65rem] right-5 rotate-[5deg]" />
      <p className="font-hand text-[1.5rem] leading-[1.35] text-ink">budget: $900 each</p>
      <p className="font-hand text-[1.25rem] leading-[1.35] text-ink-soft">hotel too?? who’s paying</p>
    </div>
  );
}
