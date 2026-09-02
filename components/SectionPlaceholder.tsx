import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { motion } from "motion/react";
import { PageHeader } from "@/components/PageHeader";
import { Reveal, Stagger, StaggerItem } from "@/components/motion-primitives";

export function SectionPlaceholder({
  tripId,
  eyebrow,
  title,
  description,
  bullets,
  icon: Icon,
  children,
}: {
  tripId: string;
  eyebrow: string;
  title: string;
  description: string;
  bullets: string[];
  icon: LucideIcon;
  children?: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-3xl px-5 py-12 sm:px-8">
      <PageHeader eyebrow={eyebrow} title={title} description={description} />

      {children ? (
        <div className="mt-8">{children}</div>
      ) : (
        <Reveal delay={0.08}>
          <div className="mt-8 overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
            <div className="flex items-center gap-3 border-b border-border bg-coral-soft/40 px-5 py-4">
              <motion.span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-background"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 260, damping: 20, delay: 0.15 }}
              >
                <Icon className="h-5 w-5 text-primary" />
              </motion.span>
              <div className="min-w-0">
                <p className="text-sm font-medium">Coming to this trip</p>
                <p className="truncate text-xs text-muted-foreground">Designed, being wired up</p>
              </div>
            </div>

            <Stagger className="divide-y divide-border">
              {bullets.map((b) => (
                <StaggerItem key={b}>
                  <p className="flex gap-3 px-5 py-3.5 text-sm leading-relaxed text-ink-soft">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-leaf" />
                    {b}
                  </p>
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        </Reveal>
      )}

      <Reveal delay={0.16}>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Link
            href={`/trips/${tripId}/chat`}
            className="group flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3.5 transition-colors hover:bg-accent"
          >
            <span className="text-sm">Ask the assistant instead</span>
            <ArrowRight className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <Link
            href={`/trips/${tripId}`}
            className="group flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3.5 transition-colors hover:bg-accent"
          >
            <span className="text-sm">Back to trip overview</span>
            <ArrowRight className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </Reveal>
    </div>
  );
}
