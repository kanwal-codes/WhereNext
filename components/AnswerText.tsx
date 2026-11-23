import { Skeleton } from "@/components/Skeleton";
/** The answer's place while an ask is on its way: three quiet lines at the answer's size, so the page does not jump when the words arrive. */
export function AnswerSkeleton() {
  return (
    <div aria-hidden className="space-y-3 pt-4">
      <Skeleton className="h-6 w-11/12 rounded-md" />
      <Skeleton className="h-6 w-4/5 rounded-md" />
      <Skeleton className="h-6 w-2/3 rounded-md" />
    </div>
  );
}

/**
 * The written answer at the top of a results page (Eat, Stays, Flights without a trip): a short paragraph of plain text, no title, set a size up in the display face so it reads as a lede and not as a caption.
 * It is part of the page, not a layer over it: it scrolls away like any other text, and the filter row below it is what holds.
 */
export function AnswerText({ body }: { body: string }) {
  // A short answer is set larger so it has presence; a long one steps down so it never takes more than about a third of the screen.
  const size = body.length <= 130 ? "text-[1.5rem] leading-[1.32]" : body.length <= 250 ? "text-[1.375rem] leading-[1.38]" : "text-[1.1875rem] leading-[1.45]";
  return (
    <section aria-label="Roam’s answer" className="pt-3">
      <p className={`font-display font-normal tracking-[-0.018em] text-foreground text-pretty ${size}`}>{body}</p>
    </section>
  );
}
