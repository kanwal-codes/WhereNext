"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { RoamMark } from "@/features/roam/ui/RoamMark";
import { CertaintyBadge } from "@/components/CertaintyBadge";
import { certaintyFor, decisionSummary } from "@/lib/decisions-ui";
import type { ReactNode } from "react";
import { hasTaste, type TastePicture } from "@/lib/trip-overview";

const panel = "rounded-3xl border border-border/70 bg-card p-6 shadow-soft";

function Chip({ children, tone }: { children: string; tone: "like" | "avoid" | "diet" | "fact" }) {
  const toneClass = {
    like: "border-leaf/30 bg-leaf/10 text-foreground",
    avoid: "border-border bg-muted text-muted-foreground line-through decoration-muted-foreground/50",
    diet: "border-coral/30 bg-coral/10 text-foreground",
    fact: "border-border bg-background text-foreground",
  }[tone];
  return <span className={`daisy-badge h-7 px-3 text-[13px] ${toneClass}`}>{children}</span>;
}

/** What the trip knows about the group, as chips, and what is still undecided, with the next step. */
export function TasteAndQuestions({ tripId, taste, questions }: { tripId: string; taste: TastePicture; questions: string[] }) {
  return (
    <section className={panel}>
      <h2 className="font-display text-2xl tracking-tight">What we know</h2>
      {hasTaste(taste) ? (
        <div className="mt-4 space-y-4">
          {taste.facets.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {taste.facets.map((facet) => (
                <Chip key={facet.label} tone="fact">{`${facet.label}: ${facet.value}`}</Chip>
              ))}
            </div>
          )}
          {taste.likes.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">Into</p>
              <div className="flex flex-wrap gap-2">{taste.likes.map((item) => <Chip key={item} tone="like">{item}</Chip>)}</div>
            </div>
          )}
          {taste.avoids.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">Not for us</p>
              <div className="flex flex-wrap gap-2">{taste.avoids.map((item) => <Chip key={item} tone="avoid">{item}</Chip>)}</div>
            </div>
          )}
          {taste.dietary.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">Eating</p>
              <div className="flex flex-wrap gap-2">{taste.dietary.map((item) => <Chip key={item} tone="diet">{item}</Chip>)}</div>
            </div>
          )}
        </div>
      ) : (
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">Tell Roam where you&rsquo;re going, what matters to you, and how you want the days to feel.</p>
      )}

      <div className="mt-6 border-t border-border pt-5">
        <h3 className="text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">Still to decide</h3>
        {questions.length > 0 ? (
          <ul className="mt-3 space-y-2.5">
            {questions.map((question) => (
              <li key={question} className="flex gap-2.5 text-sm leading-relaxed text-ink-soft">
                <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-coral" />
                {question}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">Nothing pressing. Keep planning.</p>
        )}
        <Link href={`/trips/${tripId}/chat`} className="btn-primary mt-5 w-full">
          <RoamMark state="settled" size={30} /> Continue planning <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}

export function DecisionsPanel({ decisions }: { decisions: Array<{ id: string; kind: string; value: Record<string, unknown>; source?: string }> }) {
  if (decisions.length === 0) return null;
  return (
    <section className={panel}>
      <h2 className="font-display text-2xl tracking-tight">Decisions</h2>
      <ul className="mt-3">
        {decisions.slice(0, 6).map((decision) => (
          <li key={decision.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border py-3 last:border-0 last:pb-0">
            <div className="min-w-0">
              <p className="text-[11px] tracking-[0.1em] text-muted-foreground uppercase">{decision.kind.replaceAll("_", " ")}</p>
              <p className="truncate text-sm">{decisionSummary(decision.kind, decision.value)}</p>
            </div>
            <CertaintyBadge certainty={certaintyFor(decision.source)} />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function RoamNotes({ notes }: { notes: string[] }) {
  if (notes.length === 0) return null;
  return (
    <section className="rounded-3xl border border-dashed border-border p-6">
      <h2 className="flex items-center gap-2 font-display text-2xl tracking-tight">
        <RoamMark state="settled" size={40} /> Roam&rsquo;s latest
      </h2>
      <ul className="mt-3 space-y-3">
        {notes.map((note, index) => (
          <li key={index} className="line-clamp-3 text-sm leading-relaxed text-ink-soft">{note}</li>
        ))}
      </ul>
    </section>
  );
}

/** The closing spread: taste and open questions beside weather, then decisions, Roam's notes and sharing. */
export function BriefPanels({
  tripId,
  taste,
  questions,
  decisions,
  notes,
  weather,
  share,
}: {
  tripId: string;
  taste: TastePicture;
  questions: string[];
  decisions: Array<{ id: string; kind: string; value: Record<string, unknown>; source?: string }>;
  notes: string[];
  weather: ReactNode;
  share: ReactNode;
}) {
  return (
    <div className="grid min-w-0 gap-6 lg:grid-cols-2">
      <div className="min-w-0 space-y-6">
        <TasteAndQuestions tripId={tripId} taste={taste} questions={questions} />
        <RoamNotes notes={notes} />
      </div>
      <div className="min-w-0 space-y-6">
        {weather}
        <DecisionsPanel decisions={decisions} />
        {share}
      </div>
    </div>
  );
}
