"use client";

import { AnimatePresence, motion } from "motion/react";
import { Loader2 } from "lucide-react";
import type { useStyleEditor } from "../application/useStyleEditor";
import { BUDGET, DIETARY, INTERESTS, PACE, STAY_TYPES, COMPANIONS, UNSET_NOTE } from "./account-options";
import { Chip, Pill, ReadRow, Segmented, SettingSection } from "./AccountParts";

/** Travel style: what personalises Discover, read as a sentence and pills, or edited as chips and segments. */
export function StyleSection({ editor, toggleChip, touch }: {
  editor: ReturnType<typeof useStyleEditor>;
  toggleChip: (list: string[], set: (v: string[]) => void, v: string) => void;
  touch: () => void;
}) {
  const { interests, setInterests, dietary, setDietary, dietNote, setDietNote, pace, setPace, budget, setBudget, stay, setStay, companions, setCompanions, editingStyle, startStyleEdit, cancelStyleEdit, savingStyle, finishStyleEdit, styleSaved, summary } = editor;
  return (
    <SettingSection
      id="style"
      title="Travel style"
      blurb="What personalises Discover — new trips start tuned to this."
      action={
        editingStyle ? (
          <>
            <button type="button" onClick={cancelStyleEdit} className="rounded-full border border-border px-4 py-1.5 text-sm text-ink-soft transition-colors hover:border-ink/25 hover:text-foreground">Cancel</button>
            <button type="button" onClick={() => void finishStyleEdit()} disabled={savingStyle} className="inline-flex items-center gap-2 rounded-full bg-coral px-4 py-1.5 text-sm text-background transition-opacity hover:opacity-90 disabled:opacity-60">
              {savingStyle && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Done
            </button>
          </>
        ) : (
          <button type="button" onClick={startStyleEdit} className="rounded-full border border-border px-4 py-1.5 text-sm text-foreground transition-colors hover:border-ink/25">Edit</button>
        )
      }
    >
      <AnimatePresence mode="wait" initial={false}>
        {editingStyle ? (
          <motion.div key="edit" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }} className="space-y-8">
            <div>
              <p className="eyebrow mb-3">Interests</p>
              <div className="flex flex-wrap gap-2">
                {INTERESTS.map((i) => <Chip key={i} active={interests.includes(i)} onClick={() => toggleChip(interests, setInterests, i)}>{i}</Chip>)}
              </div>
            </div>

            <div className="grid gap-8 sm:grid-cols-2">
              <div>
                <p className="eyebrow mb-4">Pace</p>
                <Segmented clearable options={PACE.map((p) => p.label)} value={PACE[pace]?.label ?? ""} onChange={(v) => { setPace(PACE.findIndex((p) => p.label === v)); touch(); }} />
                <p className="mt-3 text-sm text-ink-soft">{PACE[pace]?.note ?? UNSET_NOTE}</p>
              </div>
              <div>
                <p className="eyebrow mb-4">Budget</p>
                <Segmented clearable options={BUDGET.map((b) => b.label)} value={BUDGET[budget]?.label ?? ""} onChange={(v) => { setBudget(BUDGET.findIndex((b) => b.label === v)); touch(); }} />
                <p className="mt-3 text-sm text-ink-soft">{BUDGET[budget]?.note ?? UNSET_NOTE}</p>
              </div>
            </div>

            <div>
              <p className="eyebrow mb-3">Dietary needs</p>
              <div className="flex flex-wrap gap-2">
                {DIETARY.map((d) => <Chip key={d} active={dietary.includes(d)} onClick={() => toggleChip(dietary, setDietary, d)}>{d}</Chip>)}
              </div>
              <input className="input-field mt-3 max-w-md" placeholder="Anything else we should know?" value={dietNote} onChange={(e) => { setDietNote(e.target.value); touch(); }} />
            </div>

            <div className="grid gap-8 sm:grid-cols-2">
              <div>
                <p className="eyebrow mb-3">Preferred stay</p>
                <Segmented options={STAY_TYPES} value={stay} onChange={(v) => { setStay(v); touch(); }} />
              </div>
              <div>
                <p className="eyebrow mb-3">Usually travelling</p>
                <Segmented clearable options={COMPANIONS} value={companions} onChange={(v) => { setCompanions(v); touch(); }} />
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div key="view" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }} className="space-y-8">
            <div className="rounded-3xl bg-gradient-to-br from-muted/60 to-coral-soft/50 p-6">
              <p className="eyebrow mb-2">In a sentence</p>
              <p className="font-display text-xl leading-snug tracking-tight text-balance sm:text-2xl">{summary}</p>
            </div>
            <div>
              <p className="eyebrow mb-3">Interests</p>
              {interests.length ? (
                <div className="flex flex-wrap gap-2">{interests.map((i) => <Pill key={i}>{i}</Pill>)}</div>
              ) : (
                <p className="text-sm text-ink-soft">No interests picked yet. <button type="button" onClick={startStyleEdit} className="text-coral hover:underline">Add some</button></p>
              )}
            </div>

            <div className="grid gap-8 sm:grid-cols-2">
              <ReadRow label="Pace" value={PACE[pace]?.label ?? "Not set"} note={PACE[pace]?.note ?? UNSET_NOTE} level={PACE[pace] ? { value: pace, max: PACE.length } : undefined} />
              <ReadRow label="Budget" value={BUDGET[budget]?.label ?? "Not set"} note={BUDGET[budget]?.note ?? UNSET_NOTE} level={BUDGET[budget] ? { value: budget, max: BUDGET.length } : undefined} />
            </div>

            <div>
              <p className="eyebrow mb-3">Dietary needs</p>
              {dietary.length ? <div className="flex flex-wrap gap-2">{dietary.map((d) => <Pill key={d}>{d}</Pill>)}</div> : <p className="text-sm text-ink-soft">Nothing to avoid.</p>}
              {dietNote ? <p className="mt-3 text-sm text-ink-soft">{dietNote}</p> : null}
            </div>

            <div className="grid gap-8 sm:grid-cols-2">
              <ReadRow label="Preferred stay" value={stay} />
              <ReadRow label="Usually travelling" value={companions || "Not set"} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {styleSaved && (
          <motion.div initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.98 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }} className="rounded-2xl border border-coral/25 bg-coral-soft/50 px-5 py-4">
            <p className="eyebrow mb-1">Travel style saved</p>
            <p className="text-sm leading-relaxed text-foreground">From now on, {summary}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </SettingSection>
  );
}
