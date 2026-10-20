"use client";

// TEMPORARY (phone redesign): renders every Roam widget from fixtures through the real components, in light or dark.
// `?theme=dark`, `?scene=3` (just that scene) and `?edge=1` (the edge-case set). No API calls. Delete when the redesign has shipped.
import React, { useEffect, useState } from "react";
import { AssistantMessage } from "@/features/conversation/ui/AssistantMessage";
import type { AssistantBlock } from "@/packages/contracts/assistant";
import { edgeScenes, FIXTURE_ORIGIN, scenes } from "./fixtures";

const noop = () => undefined;
const localize = (blocks: AssistantBlock[] | undefined, origin: string) => (blocks ? (JSON.parse(JSON.stringify(blocks).replaceAll(FIXTURE_ORIGIN, origin)) as AssistantBlock[]) : undefined);
const handlers = { tripId: "00000000-0000-0000-0000-000000000000", onFollowup: noop, onOpenPlace: noop, onOpenStay: noop, onOpenEvent: noop, onOpenCollection: noop, onOpenPanel: noop };

export function AuditClient({ theme, scene, edge }: { theme: "light" | "dark"; scene?: string; edge: boolean }) {
  // The fixture pictures need this page's own origin, which the server render does not have: draw after mount.
  const [origin, setOrigin] = useState<string | null>(null);
  useEffect(() => setOrigin(window.location.origin), []);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    return () => document.documentElement.classList.remove("dark");
  }, [theme]);
  if (origin == null) return null;
  const all = edge ? edgeScenes : scenes;
  const shown = scene ? all.filter((s) => s.label.split(" ")[0] === scene) : all;
  return (
    <div className="icons-fine min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-[430px] space-y-10 px-4 py-6">
        {shown.map((s) => (
          <section key={s.label} data-scene={s.label.split(" ")[0]} className="space-y-4">
            <p className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">{s.label}</p>
            <div className="flex justify-end">
              <p className="max-w-[85%] rounded-2xl rounded-br-lg bg-primary px-4 py-2.5 text-sm leading-relaxed text-primary-foreground">{s.user}</p>
            </div>
            <AssistantMessage content={s.text} blocks={localize(s.blocks, origin)} handlers={handlers} />
          </section>
        ))}
      </div>
    </div>
  );
}
