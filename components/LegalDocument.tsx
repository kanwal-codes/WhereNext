import type { ReactNode } from "react";
import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";

export function LegalDocument({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-6 py-8 sm:px-10">
        <Link href="/" className="inline-flex items-center gap-2 text-sm">
          <BrandMark variant="compact" />
          <BrandMark variant="text" />
        </Link>
        <nav className="flex items-center gap-5 text-xs text-muted-foreground">
          <Link href="/privacy" className="link-underline">
            Privacy
          </Link>
          <Link href="/terms" className="link-underline">
            Terms
          </Link>
        </nav>
      </header>

      <main className="mx-auto max-w-3xl px-6 pb-24 sm:px-10">
        <p className="eyebrow">Legal</p>
        <h1 className="mt-3 font-display text-4xl leading-[1.1] tracking-[-0.03em] sm:text-5xl">{title}</h1>
        <p className="mt-3 text-sm text-muted-foreground">Last updated {updated}</p>
        <div className="mt-10 space-y-8 text-sm leading-relaxed text-ink-soft [&_a]:underline [&_a]:underline-offset-2">{children}</div>
      </main>

      <footer className="mx-auto max-w-3xl px-6 pb-12 sm:px-10">
        <div className="hairline" />
        <p className="pt-6 text-xs text-muted-foreground">
          Questions:{" "}
          <a href="mailto:kanwal.codes17@gmail.com" className="link-underline">
            kanwal.codes17@gmail.com
          </a>
        </p>
      </footer>
    </div>
  );
}

export function LegalSection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="font-display text-xl text-foreground">{heading}</h2>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}
