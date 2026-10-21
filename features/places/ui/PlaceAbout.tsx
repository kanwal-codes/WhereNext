"use client";

import { DetailSectionHeading } from "@/components/DetailSectionHeading";
import { ExternalLink } from "@/components/ExternalLink";
import { Reveal } from "@/components/motion-primitives";
import { Badge } from "@/features/conversation/ui/blocks/ui";
import type { PlaceAbout as About } from "@/features/places/application/usePlaceDetails";
import { prettyWebsite } from "@/lib/places-ui";

/** Written for the page (see lib/application/place-about.ts), never pasted from the web. Google's own one-liner stands in
 *  while it is written, and when nothing good could be written. */
export function PlaceAbout({ about, aboutLoading, editorial, typeChips, amenities }: { about: About | null | undefined; aboutLoading: boolean; editorial: string | undefined; typeChips: string[]; amenities: string[] }) {
  if (!(editorial || about || aboutLoading || typeChips.length > 0 || amenities.length > 0)) return null;
  return (
    <Reveal delay={0.06}>
      <section>
        <DetailSectionHeading>About</DetailSectionHeading>
        {about ? (
          <p className="mt-2 text-body leading-[1.8] text-ink-soft">
            {about.content}
            {about.source && (
              <>
                {" "}
                <ExternalLink href={about.source.url} className="text-xs whitespace-nowrap">
                  {prettyWebsite(about.source.url).split("/")[0]}
                </ExternalLink>
              </>
            )}
          </p>
        ) : editorial ? (
          <p className="mt-2 text-body leading-[1.8] text-ink-soft">{editorial}</p>
        ) : aboutLoading ? (
          <div aria-hidden className="mt-3 space-y-2.5">
            <div className="skeleton h-4 w-full rounded-md" />
            <div className="skeleton h-4 w-4/5 rounded-md" />
          </div>
        ) : null}
        {(typeChips.length > 0 || amenities.length > 0) && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {typeChips.map((t) => <Badge key={t} className="capitalize">{t}</Badge>)}
            {amenities.map((a) => <Badge key={a} className="bg-transparent text-ink-soft ring-1 ring-inset ring-border">{a}</Badge>)}
          </div>
        )}
      </section>
    </Reveal>
  );
}
