"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { CalendarRange, ListChecks, X } from "lucide-react";
import { Reveal, Sheet, Stagger, StaggerItem } from "@/components/motion-primitives";
import { memberInitials } from "@/lib/member-initials";
import { memberTint } from "@/lib/member-tint";
import { useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import type { Poll } from "@/packages/contracts/poll";
import { GroupInviteCard } from "./GroupInviteCard";

/** Every member gets the same avatar — Roam included. In this chat Roam is just the fifth friend. */
export function Avatar({ name }: { name: string }) {
  return (
    <span aria-hidden style={memberTint(name)} className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-2xs font-semibold shadow-hairline">
      {memberInitials(name)}
    </span>
  );
}

/** The same "typing…" bubble any friend would show while they write back. */
export function TypingBubble() {
  return (
      <motion.div initial={{ opacity: 0, y: 10, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 380, damping: 30 }} style={{ transformOrigin: "0% 100%" }} className="mt-3 flex items-start gap-2">
        <div className="w-7 shrink-0">
          <Avatar name="Roam" />
        </div>
        <div role="status" className="flex items-center gap-1 rounded-2xl rounded-tl-lg bg-muted px-4 py-3.5 shadow-sm">
          <span className="sr-only">Roam is typing</span>
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="h-1.5 w-1.5 rounded-full bg-coral/70"
              animate={{ opacity: [0.35, 1, 0.35], y: [0, -3, 0], scale: [1, 1.15, 1] }}
              transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
            />
          ))}
        </div>
      </motion.div>
  );
}

/** The opening shot of an empty chat: a lit icon, the line, the explanation, then a few ways to break the ice. */
export function ChatEmptyState({ tripId, showInvite, onStarter }: { tripId: string; showInvite: boolean; onStarter: (starter: string) => void }) {
  return (
      <div className="flex flex-col items-center pt-0 text-center sm:pt-8">
        {/* The opening shot: a lit icon, the line, the explanation, then a few ways to break the ice. */}
        <Reveal y={8}>
          <span className="relative grid size-12 place-items-center rounded-2xl bg-coral-soft text-coral-ink shadow-hairline sm:size-14 sm:rounded-3xl">
            <CalendarRange className="size-6" />
          </span>
        </Reveal>
        <Reveal delay={0.1} y={12}>
          <h2 className="mt-4 font-display text-3xl font-medium tracking-[-0.03em] text-balance sm:mt-5">Plan it together</h2>
        </Reveal>
        <Reveal delay={0.18} y={10}>
          <p className="mx-auto mt-3 max-w-sm text-body leading-relaxed text-ink-soft text-pretty">
            This is the whole group&rsquo;s chat — everyone on the trip, plus Roam. Tag <span className="font-medium text-foreground">@Roam</span> to ask it something here.
          </p>
        </Reveal>
        <Stagger delay={0.3} gap={0.07} className="mt-5 flex flex-wrap justify-center gap-2 sm:mt-6">
          {["@Roam what should we do first?", "@Roam where should we eat tonight?"].map((starter) => (
            <StaggerItem key={starter}>
              <button type="button" onClick={() => onStarter(starter)} className="btn-chip h-9 px-4 text-sm">{starter}</button>
            </StaggerItem>
          ))}
        </Stagger>
        {/* Nobody else has joined: the invite link, here, rather than a chat that talks to itself. */}
        {showInvite && (
          <Reveal delay={0.45} y={12} className="w-full">
            <GroupInviteCard tripId={tripId} />
          </Reveal>
        )}
      </div>
  );
}

export function PollCard({ content, name, poll, pendingVoteFor, onVote }: { content: string; name: string; poll?: Poll; pendingVoteFor: string | null; onVote: (pollId: string, optionKey: string) => void }) {
  // Same template language as Roam's own structured blocks (Budget's per-category rows especially): a bordered
  // header, divide-y rows inside one continuous card, and a thin rounded-full track+fill bar per row — not a
  // separate pill per option, which was this card's own invented pattern before.
  return (
      <div className="mx-auto w-full max-w-sm overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        <p className="flex flex-wrap items-center gap-1.5 border-b border-border/60 px-4 pt-3.5 pb-2.5 font-display text-sm">
          <ListChecks className="h-3.5 w-3.5 shrink-0 text-coral" />
          <span className="min-w-0">{content}</span>
          <span className="ml-auto shrink-0 rounded-full bg-muted px-2 py-0.5 text-2xs font-medium text-muted-foreground">{name}</span>
        </p>
        {poll && (
          <>
            <div className="divide-y divide-border/60">
              {poll.options.map((option) => {
                const pct = poll.totalVotes > 0 ? Math.round((option.count / poll.totalVotes) * 100) : 0;
                return (
                  <button
                    key={option.key}
                    type="button"
                    disabled={pendingVoteFor === poll.id}
                    onClick={() => onVote(poll.id, option.key)}
                    className="block w-full px-4 py-2.5 text-left transition-colors hover:bg-accent disabled:opacity-70"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className={cn("truncate text-sm", option.mine ? "font-semibold text-primary" : "font-medium")}>{option.label}</span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{option.count} · {pct}%</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className={cn("h-full rounded-full transition-[width] duration-500 ease-out", option.mine ? "bg-primary" : "bg-primary/40")} style={{ width: `${pct}%` }} />
                    </div>
                  </button>
                );
              })}
            </div>
            <p className="border-t border-border/60 px-4 py-2 text-2xs text-muted-foreground">{poll.totalVotes} vote{poll.totalVotes === 1 ? "" : "s"}</p>
          </>
        )}
      </div>
  );
}

/** The "Start a poll" form. `onCreate` resolves true once the poll is posted; the form then closes and clears itself. */
export function PollSheet({ open, onClose, onCreate }: { open: boolean; onClose: () => void; onCreate: (question: string, options: string[]) => Promise<boolean> }) {
  // md breakpoint (tablet and up): a full-width bottom sheet reads fine on a phone but looks disconnected from the small "+" trigger on a
  // wider screen, where a compact, centered dialog box (Sheet's own "center" mode) is the better fit.
  const desktop = useMediaQuery("(min-width: 768px)");
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [saving, setSaving] = useState(false);

  async function create() {
    const q = question.trim();
    const cleaned = options.map((o) => o.trim()).filter(Boolean);
    if (!q || cleaned.length < 2 || saving) return;
    setSaving(true);
    const ok = await onCreate(q, cleaned);
    setSaving(false);
    if (!ok) return;
    onClose();
    setQuestion("");
    setOptions(["", ""]);
  }

  return (
  <Sheet open={open} onClose={() => (saving ? undefined : onClose())} ariaLabel="Start a poll" side={desktop ? "center" : "bottom"}>
    <div className="px-5 pt-1 pb-6">
      <p className="mb-3 text-sm font-medium">Start a poll</p>
      <input
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="Which hotel?"
        aria-label="Poll question"
        maxLength={200}
        className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/25"
      />
      <div className="mt-2.5 space-y-2">
        {options.map((option, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              value={option}
              onChange={(e) => setOptions((current) => current.map((o, idx) => (idx === i ? e.target.value : o)))}
              placeholder={`Option ${i + 1}`}
              aria-label={`Poll option ${i + 1}`}
              maxLength={80}
              className="min-w-0 flex-1 rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/25"
            />
            {options.length > 2 && (
              <button
                type="button"
                onClick={() => setOptions((current) => current.filter((_, idx) => idx !== i))}
                aria-label={`Remove option ${i + 1}`}
                className="shrink-0 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
      {options.length < 6 && (
        <button
          type="button"
          onClick={() => setOptions((current) => [...current, ""])}
          className="mt-2 text-xs font-medium text-primary hover:underline"
        >
          + Add option
        </button>
      )}
      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => void create()}
          disabled={saving || !question.trim() || options.filter((o) => o.trim()).length < 2}
          className="btn-primary-sm"
        >
          {saving ? "Starting…" : "Start poll"}
        </button>
        <button type="button" onClick={() => onClose()} disabled={saving} className="btn-chip">
          Cancel
        </button>
      </div>
    </div>
  </Sheet>
  );
}
