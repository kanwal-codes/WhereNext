"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { DetailSectionHeading } from "@/components/DetailSectionHeading";
import { Reveal } from "@/components/motion-primitives";
import { Badge } from "@/features/conversation/ui/blocks/ui";
import { dedupeFacilities } from "@/features/stays/domain/stay-view";
import { cn } from "@/lib/utils";

/** The headline amenities as badges, and the rest grouped behind one chip per group (one group open at a time). */
export function StayAmenities({ facilityCount, headline, grouped }: { facilityCount: number; headline: string[]; grouped: Record<string, string[]> }) {
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  if (facilityCount === 0) return null;
  const headlineSet = new Set(headline);
  return (
    <Reveal delay={0.1}>
      <section>
        <DetailSectionHeading>What&rsquo;s included</DetailSectionHeading>
        {headline.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {dedupeFacilities(headline).map((facility) => <Badge key={facility}>{facility}</Badge>)}
          </div>
        ) : <p className="mt-3 text-sm text-muted-foreground">Amenities will appear here when the hotel provides them.</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          {Object.entries(grouped).map(([group, facilities]) => {
            const remaining = dedupeFacilities(facilities.filter((facility) => !headlineSet.has(facility)));
            if (!remaining.length) return null;
            const open = openGroup === group;
            return (
              <div key={group}>
                <button type="button" onClick={() => setOpenGroup(open ? null : group)} aria-expanded={open} className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors", open ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:text-foreground")}>
                  {group} <span className="opacity-70">{remaining.length}</span><ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
                </button>
                {open && <div className="mt-2 flex flex-wrap gap-2 rounded-2xl bg-muted/35 p-3">{remaining.map((facility) => <Badge key={facility} className="bg-card">{facility}</Badge>)}</div>}
              </div>
            );
          })}
        </div>
      </section>
    </Reveal>
  );
}
