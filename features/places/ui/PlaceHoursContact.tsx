"use client";

import { Accessibility, ArrowUpRight, ChevronDown, Clock, Globe, Phone } from "lucide-react";
import { DetailSectionHeading } from "@/components/DetailSectionHeading";
import { InfoList, InfoRow } from "@/components/DetailKit";
import { cn } from "@/lib/utils";
import { prettyWebsite, type GooglePlaceDetails } from "@/lib/places-ui";
import { splitHoursLine, telHref, todayIndex } from "@/features/places/domain/place-view";

/** Today's hours (the week folds out), phone, website and step-free access. Nothing renders when the place has none of them. */
export function PlaceHoursContact({ details, hours, todayHours, wheelchair }: { details: GooglePlaceDetails; hours: string[]; todayHours: string | null; wheelchair: boolean }) {
  const hasContact = Boolean(details.nationalPhoneNumber || details.websiteUri || wheelchair);
  if (hours.length === 0 && !hasContact) return null;
  return (
    <section aria-label="Hours and contact" className="space-y-3">
      <DetailSectionHeading>Hours &amp; contact</DetailSectionHeading>
      <InfoList>
        {hours.length > 0 && (
          <li>
            <details className="group">
              <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 [&::-webkit-details-marker]:hidden">
                <Clock className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1 truncate">Today · {todayHours}</span>
                {hours.length > 1 && (
                  <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary">
                    All days <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" aria-hidden />
                  </span>
                )}
              </summary>
              <dl className="grid grid-cols-[6.5rem_1fr] gap-x-3 gap-y-1.5 pb-3 pl-7 text-sm text-muted-foreground">
                {hours.map((h, i) => {
                  const [day, hoursText] = splitHoursLine(h);
                  const today = i === todayIndex();
                  return (
                    <div key={h} className={cn("col-span-2 grid grid-cols-subgrid tabular-nums", today && "font-medium text-foreground")}>
                      <dt>{day}</dt>
                      <dd>{hoursText}</dd>
                    </div>
                  );
                })}
              </dl>
            </details>
          </li>
        )}
        {details.nationalPhoneNumber && (
          <InfoRow icon={Phone} href={telHref(details.nationalPhoneNumber)}>
            {details.nationalPhoneNumber}
          </InfoRow>
        )}
        {details.websiteUri && (
          <InfoRow icon={Globe} href={details.websiteUri} external trailing={<ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />}>
            {prettyWebsite(details.websiteUri)}
          </InfoRow>
        )}
        {wheelchair && <InfoRow icon={Accessibility}>Wheelchair accessible</InfoRow>}
      </InfoList>
    </section>
  );
}
