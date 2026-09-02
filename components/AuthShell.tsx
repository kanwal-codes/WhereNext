"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { Quote } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { Reveal, WordReveal } from "@/components/motion-primitives";
import { cn } from "@/lib/utils";

/**
 * Split auth canvas: quiet form column on the left, filmic travel plate on the
 * right that dissolves into the page the same way the app's heroes do.
 */
export function AuthShell({
  eyebrow,
  title,
  subtitle,
  children,
  footer,
  className,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
      <div className="relative flex flex-col px-5 py-8 sm:px-10 lg:px-14">
        <Link href="/" className="inline-flex w-fit items-center gap-2 text-sm">
          <BrandMark variant="compact" />
          <BrandMark variant="text" />
        </Link>

        <div className="flex flex-1 items-center py-10">
          <div className={cn("w-full max-w-md", className)}>
            <Reveal>
              <p className="eyebrow">{eyebrow}</p>
            </Reveal>
            <WordReveal text={title} delay={0.08} className="mt-3 font-display text-4xl leading-[1.12] sm:text-[2.75rem]" />
            <Reveal delay={0.22}>
              <p className="mt-3 text-sm leading-relaxed text-ink-soft">{subtitle}</p>
            </Reveal>

            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.28, ease: [0.22, 0.61, 0.36, 1] }}
              className="mt-8"
            >
              {children}
            </motion.div>
          </div>
        </div>

        {footer ? (
          <Reveal delay={0.4}>
            <div className="text-xs text-muted-foreground">{footer}</div>
          </Reveal>
        ) : null}
      </div>

      {/* Filmic plate */}
      <div className="relative hidden overflow-hidden lg:block">
        <motion.img
          src="/design/auth-side.jpg"
          alt="A quiet coast road disappearing into morning fog"
          width={1024}
          height={1536}
          className="absolute inset-0 h-full w-full object-cover"
          initial={{ scale: 1.12, opacity: 0 }}
          animate={{ scale: 1.04, opacity: 1 }}
          transition={{ opacity: { duration: 1.1 }, scale: { duration: 22, ease: "linear" } }}
        />
        <div className="grain pointer-events-none absolute inset-0" />
        <div className="vignette pointer-events-none absolute inset-0" />
        <div className="pointer-events-none absolute inset-y-0 left-0 w-40 bg-gradient-to-r from-background via-background/60 to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 -left-px w-20 bg-background [mask-image:linear-gradient(to_right,black,transparent)] backdrop-blur-md" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-background/70 to-transparent" />

        <Reveal delay={0.5} className="absolute inset-x-0 bottom-0 p-10">
          <div className="max-w-sm rounded-2xl border border-border/60 bg-card/70 p-6 shadow-soft backdrop-blur-xl">
            <Quote className="h-4 w-4 text-coral" />
            <p className="mt-3 font-display text-lg leading-snug">A trip should build itself while you talk about it.</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Conversation in, an organised plan out — dates, stays, routes and everything you decided along the way.
            </p>
          </div>
        </Reveal>
      </div>
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  // `hint` is deliberately a sibling of the <label>, not inside it, so the
  // control's accessible name stays exactly `label` (e.g. "Password").
  return (
    <div className="relative">
      <label className="block">
        <span className="text-xs font-medium tracking-[0.06em] text-ink-soft uppercase">{label}</span>
        <div className="mt-2">{children}</div>
      </label>
      {hint ? <div className="absolute top-0 right-0">{hint}</div> : null}
    </div>
  );
}

export const inputClass =
  "w-full rounded-xl border border-input bg-card px-4 py-3 text-sm outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground/70 focus:border-coral focus:ring-4 focus:ring-coral/12";

export function SubmitButton({
  children,
  loading,
  ...rest
}: { children: ReactNode; loading?: boolean } & Omit<React.ComponentProps<typeof motion.button>, "children">) {
  return (
    <motion.button
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 380, damping: 26 }}
      className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-medium text-primary-foreground disabled:opacity-70"
      disabled={loading}
      {...rest}
    >
      {loading ? (
        <motion.span
          className="h-4 w-4 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground"
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }}
        />
      ) : null}
      {children}
    </motion.button>
  );
}

export function Divider({ label }: { label: string }) {
  return (
    <div className="my-6 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
      <span className="hairline" />
      <span className="text-[11px] tracking-[0.14em] text-muted-foreground uppercase">{label}</span>
      <span className="hairline" />
    </div>
  );
}
