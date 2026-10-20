"use client";

import { useState } from "react";
import { ArrowRight, Check, Compass, Info, MapPin, ChevronDown, ChevronRight } from "lucide-react";
import type { AssistantBlock } from "@/packages/contracts/assistant";
import { cn } from "@/lib/utils";
import { Widget, WidgetPill } from "./Widget";
import { comparisonView } from "@/features/conversation/domain/comparisonView";
import { factGlyph } from "./glyphs";
import { Badge, Meta, controlSecondary, type } from "./ui";
import { BlockHandlers } from "./blockShared";

type ComparisonBlockData = Extract<AssistantBlock, { type: "comparison" }>;

/** One colour per option, the same on the phone's stacked lines and the wide layout's column heads. */
const OPTION_DOT = ["var(--color-chart-1)", "var(--color-chart-2)", "var(--color-chart-3)", "var(--color-chart-4)", "var(--color-chart-5)", "var(--color-muted-foreground)"] as const;

/** Wide layout: the label column, then one equal column per option (Tailwind needs the whole class written out). */
const COMPARE_COLS: Record<number, string> = {
  2: "@[34rem]:grid-cols-[6.5rem_minmax(0,1fr)_minmax(0,1fr)]",
  3: "@[34rem]:grid-cols-[6.5rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]",
  4: "@[34rem]:grid-cols-[6.5rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]",
  5: "@[34rem]:grid-cols-[5rem_repeat(5,minmax(0,1fr))]",
  6: "@[34rem]:grid-cols-[5rem_repeat(6,minmax(0,1fr))]",
};

/**
 * The options side by side on a wide card, and stacked per question on a phone: the verdict first, then one block per thing
 * compared, each option's answer on its own line under it (so a long answer has the whole width instead of a narrow column).
 * What nobody knows anything about is left out.
 */
export function ComparisonBlockView({ block }: { block: ComparisonBlockData }) {
  const view = comparisonView(block);
  const best = block.bestForYou;
  const [all, setAll] = useState(false);
  // Four options fit side by side; the rest are one tap away.
  const shown = all || view.options.length <= 4 ? view.options.length : 3;
  const options = view.options.slice(0, shown);
  const cols = COMPARE_COLS[Math.min(6, Math.max(2, options.length))];
  return (
    <Widget
      glyph="compare"
      tone="lagoon"
      eyebrow="Compare"
      title={block.title}
      foot={best ? undefined : `${view.options.length} options compared`}
      hero={best ? (
        <div className="mx-4 mt-3.5 flex items-start gap-3 rounded-2xl bg-secondary px-4 py-3.5 @[34rem]:mx-[1.125rem]">
          <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-positive text-white" aria-hidden><Check className="size-4" strokeWidth={2.5} /></span>
          <div className="min-w-0">
            <p className="eyebrow text-positive">Best for you</p>
            <p className="font-display text-lg leading-snug font-medium">{best.label}</p>
            <p className={cn(type.body, "mt-0.5 text-ink-soft")}>{best.reason}</p>
          </div>
        </div>
      ) : undefined}
    >
      <div className="mt-3.5 border-t border-border">
        {/* Wide: the option names as column heads, the pick marked. On a phone each line names its own option instead. */}
        <div className={cn("hidden gap-x-4 px-4 pt-3.5 @[34rem]:grid @[34rem]:px-[1.125rem]", cols)} aria-hidden>
          <span />
          {options.map((option, i) => (
            <div key={option.label} className="flex min-w-0 items-center gap-2">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: OPTION_DOT[i] }} />
              <span className={cn("min-w-0 truncate font-display text-base font-medium", option.best && "text-positive")}>{option.label}</span>
              {option.best && <Check className="size-4 shrink-0 text-positive" aria-hidden />}
            </div>
          ))}
        </div>
        <dl>
          {view.attributes.map((attribute) => (
            <div key={attribute.name} className={cn("grid gap-y-2.5 border-t border-border px-4 py-3.5 first:border-t-0 @[34rem]:items-start @[34rem]:gap-x-4 @[34rem]:px-[1.125rem] @[34rem]:first:border-t @[34rem]:mt-3", cols)}>
              <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase @[34rem]:pt-0.5">{attribute.name}</dt>
              {options.map((option, i) => {
                const value = attribute.values[i];
                return (
                  <dd key={option.label} className={cn("flex min-w-0 items-start gap-2.5 @[34rem]:block @[34rem]:rounded-xl @[34rem]:-mx-2.5 @[34rem]:px-2.5 @[34rem]:py-1.5", option.best && "@[34rem]:bg-secondary")}>
                    <span aria-hidden className="mt-[0.4rem] size-2.5 shrink-0 rounded-full @[34rem]:hidden" style={{ background: OPTION_DOT[i] }} />
                    <span className="min-w-0">
                      <span className={cn("block text-xs font-medium @[34rem]:sr-only", option.best ? "text-positive" : "text-muted-foreground")}>{option.label}</span>
                      <span className={cn(type.body, "block leading-snug text-pretty", !value && "text-muted-foreground")}>{value || "Not enough information yet"}</span>
                    </span>
                  </dd>
                );
              })}
            </div>
          ))}
        </dl>
        {options.length < view.options.length && (
          <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 @[34rem]:px-[1.125rem]">
            <span className={type.meta}>{view.options.length - options.length} more options hidden</span>
            <button type="button" onClick={() => setAll(true)} className={controlSecondary}>Show all <ChevronDown className="size-3.5" aria-hidden /></button>
          </div>
        )}
      </div>
    </Widget>
  );
}

type StructuredAnswerBlockData = Extract<AssistantBlock, { type: "structured_answer" }>;

/** Sections in one card — a section of short figures becomes tiles, a longer list of figures a price list. */
export function StructuredAnswerBlockView({ block }: { block: StructuredAnswerBlockData }) {
  const first = block.sections[0];
  // A long answer keeps its first two sections open; the others are headings that open on a tap.
  const [openSet, setOpenSet] = useState<Set<number>>(new Set());
  const folds = block.sections.length > 3;
  return (
    <Widget glyph="star" tone="lagoon" eyebrow="Good to know" title={block.sections.length === 1 && first ? first.heading : "Quick answer"} foot={undefined}>
      <div className="mt-1 divide-y divide-border">
        {block.sections.map((section, i) => {
          const figures = section.bullets.some((bullet) => bullet.detail);
          // Icons only when the section is practical facts (a plug, a tip, an emergency number); a plain price list stays plain.
          const icons = figures && section.bullets.some((bullet) => factGlyph(`${bullet.text} ${bullet.detail ?? ""}`));
          const tiles = figures && !icons && section.bullets.length <= 4 && section.bullets.every((bullet) => (bullet.detail ?? "").length <= 14);
          return (
            folds && i >= 2 && !openSet.has(i) ? (
              <button key={i} type="button" aria-expanded={false} onClick={() => setOpenSet((cur) => new Set(cur).add(i))} className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left @[34rem]:px-[1.125rem]">
                <span className={type.title}>{section.heading}</span>
                <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </button>
            ) : (
            <section key={i} className="space-y-2 px-4 py-4 @[34rem]:px-[1.125rem]">
              {(block.sections.length > 1 || i > 0) && <h3 className={type.title}>{section.heading}</h3>}
              {tiles ? (
                <dl className="grid grid-cols-2 gap-2.5 pt-1">
                  {section.bullets.map((bullet, j) => (
                    <div key={j} className="rounded-2xl bg-secondary px-3.5 py-3">
                      <dt className="eyebrow">{bullet.text}</dt>
                      <dd className="mt-1 font-display text-title leading-none font-medium tracking-[-0.025em] tabular-nums">{bullet.detail}</dd>
                    </div>
                  ))}
                </dl>
              ) : figures ? (
                <dl className="divide-y divide-border/60">
                  {section.bullets.map((bullet, j) => {
                    const glyph = icons ? factGlyph(`${bullet.text} ${bullet.detail ?? ""}`) : null;
                    const Icon = glyph?.icon ?? Info;
                    return (
                      <div key={j} className="flex items-start gap-3 py-2">
                        {icons && (
                          <span aria-hidden className="mt-px grid size-8 shrink-0 place-items-center rounded-xl bg-lagoon-soft text-lagoon">
                            <Icon className="size-4" />
                          </span>
                        )}
                        <dt className={cn(type.body, "min-w-0 flex-1 pt-1 text-ink-soft")}>{bullet.text}</dt>
                        <dd className={cn(type.body, type.num, "max-w-[55%] shrink-0 pt-1 text-right")}>{bullet.detail}</dd>
                      </div>
                    );
                  })}
                </dl>
              ) : (
                <ul className={cn(type.body, "list-disc space-y-1 pl-5 text-ink-soft marker:text-muted-foreground")}>
                  {section.bullets.map((bullet, j) => (
                    <li key={j}>{bullet.text}</li>
                  ))}
                </ul>
              )}
            </section>
            )
          );
        })}
      </div>
    </Widget>
  );
}

type OptionsBlockData = Extract<AssistantBlock, { type: "options" }>;

export function OptionsBlockView({ block, onFollowup, onOpenPanel }: { block: OptionsBlockData } & Pick<BlockHandlers, "onFollowup" | "onOpenPanel">) {
  const Icon = block.kind === "area" ? MapPin : Compass;
  const [showAll, setShowAll] = useState(false);
  // Three show; the rest are one tap away, so the card never grows without limit.
  const items = showAll || block.items.length <= 4 ? block.items : block.items.slice(0, 3);
  // Each option leads somewhere: the two next things a traveller asks about an area or a day trip.
  const actions = (name: string): Array<[label: string, prompt: string]> =>
    block.kind === "area"
      ? [["Stays here", `Show me places to stay in ${name}.`], ["What to do", `What are the best things to do in and around ${name}?`]]
      : [["How to get there", `How do I get to ${name} for a day trip, and how long does it take each way?`], ["Plan the day", `Plan a day trip to ${name}: what to see, in what order, and when to head back.`]];
  return (
    <Widget
      glyph="place"
      tone="coral"
      eyebrow={block.kind === "area" ? "Areas" : "Day trips"}
      title={block.kind === "area" ? "Where to base yourselves" : "Day trips worth the journey"}
      status={<WidgetPill>{block.items.length} {block.kind === "area" ? "area" : "trip"}{block.items.length === 1 ? "" : "s"}</WidgetPill>}
      foot={block.estimated ? "Estimated from general knowledge, not backed by a current source" : undefined}
    >
      <div className="mt-3.5 divide-y divide-border border-t border-border">
        {items.map((item) => (
          // The whole row opens the full view (the title's button stretches over it); the two actions sit above that and keep working.
          <article key={item.name} className={cn("relative flex flex-wrap items-start gap-x-3 gap-y-3 px-4 py-4 @[34rem]:gap-x-4 @[34rem]:px-[1.125rem]", onOpenPanel && "transition-colors duration-200 hover:bg-surface/70")}>
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-coral-soft text-coral-ink @[34rem]:size-[4.5rem] @[34rem]:rounded-2xl" aria-hidden>
              <Icon className="size-5 @[34rem]:size-7" strokeWidth={1.5} />
            </span>
            <div className="min-w-0 flex-1 basis-48 space-y-1">
              <h4 className="line-clamp-2 font-display text-lg leading-snug font-medium">
                {onOpenPanel ? (
                  <button
                    type="button"
                    onClick={() => onOpenPanel({ kind: "area", optionKind: block.kind, items: block.items, active: block.items.indexOf(item), estimated: block.estimated, onAsk: onFollowup })}
                    aria-label={`Open ${item.name}`}
                    className="inline-flex items-center gap-1 text-left after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:rounded-2xl focus-visible:after:outline-2 focus-visible:after:outline-offset-[-2px] focus-visible:after:outline-ring"
                  >
                    {item.name}
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  </button>
                ) : item.name}
              </h4>
              <Meta items={[item.meta]} />
              <p className={cn(type.body, "line-clamp-3 text-ink-soft")}>{item.blurb}</p>
              {(item.tags.length > 0 || item.bestFor) && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  {item.tags.map((tag) => <Badge key={tag}>{tag}</Badge>)}
                  {item.bestFor && <Badge tone="positive" icon={Check}>Best for {item.bestFor}</Badge>}
                </div>
              )}
            </div>
            <div className="relative z-10 flex shrink-0 gap-2 @max-[34rem]:w-full @[34rem]:w-36 @[34rem]:flex-col">
              {actions(item.name).map(([label, prompt]) => (
                <button key={label} type="button" className={cn(controlSecondary, "h-9 flex-1 justify-between px-3.5 @[34rem]:flex-none")} onClick={() => onFollowup(prompt)}>
                  {label} <ArrowRight className="size-3.5" aria-hidden />
                </button>
              ))}
            </div>
          </article>
        ))}
        {items.length < block.items.length && (
          <div className="flex items-center justify-between gap-3 px-4 py-3.5 @[34rem]:px-[1.125rem]">
            <span className={cn(type.meta, "min-w-0 truncate")}>{block.items.length - items.length} more · {block.items.slice(items.length).map((i) => i.name).join(", ")}</span>
            <button type="button" onClick={() => setShowAll(true)} className={controlSecondary}>Show {block.items.length - items.length} more <ChevronDown className="size-3.5" aria-hidden /></button>
          </div>
        )}
      </div>
    </Widget>
  );
}
