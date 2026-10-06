"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Bell, Compass, Database, LogOut, UserRound, type LucideIcon } from "lucide-react";
import { signOut } from "@/features/identity/application/authClient";
import { memberInitials } from "@/lib/member-initials";
import { cn } from "@/lib/utils";

/** Each one lands on its own section of the account page. */
const ITEMS: Array<{ href: string; label: string; hint: string; Icon: LucideIcon }> = [
  { href: "/account#profile", label: "Profile", hint: "Name, photo, email", Icon: UserRound },
  { href: "/account#style", label: "Travel style", hint: "What Roam plans around", Icon: Compass },
  { href: "/account#notifications", label: "Notifications and sharing", hint: "Alerts, shared trips", Icon: Bell },
  { href: "/account#danger", label: "Account data", hint: "Export or delete", Icon: Database },
];

const WIDTH = 256;
const ROW = "flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none";

/** The account avatar: opens a short menu (profile, travel style, notifications, account data, sign out) instead of leaving the page. */
export function AccountMenu({ displayName, className }: { displayName: string; className?: string }) {
  const reduce = useReducedMotion();
  const menuId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const open = pos !== null;

  const close = useCallback((refocus = false) => {
    setPos(null);
    if (refocus) buttonRef.current?.focus();
  }, []);

  const toggle = () => {
    if (open) return close();
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    // Right-aligned under the avatar, and never off the left edge of a narrow screen.
    setPos({ left: Math.max(12, Math.min(rect.right - WIDTH, window.innerWidth - WIDTH - 12)), top: rect.bottom + 8 });
  };

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const away = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !buttonRef.current?.contains(target)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") return close(true);
      if (event.key === "Tab") return close();
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      event.preventDefault();
      const rows = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
      const at = rows.indexOf(document.activeElement as HTMLElement);
      rows[(at + (event.key === "ArrowDown" ? 1 : -1) + rows.length) % rows.length]?.focus();
    };
    const dismiss = () => close();
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", dismiss);
    window.addEventListener("scroll", dismiss, { passive: true });
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("scroll", dismiss);
    };
  }, [open, close]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        title={displayName}
        aria-label="Account"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={toggle}
        className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border/60 bg-background/92 text-xs font-semibold text-foreground transition-[opacity,transform] hover:opacity-70 active:scale-95", open && "opacity-70", className)}
      >
        {memberInitials(displayName)}
      </button>
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {open && pos && (
              <motion.div
                id={menuId}
                ref={menuRef}
                role="menu"
                aria-label="Account"
                initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: -4 }}
                transition={{ duration: reduce ? 0 : 0.14, ease: [0.22, 1, 0.36, 1] }}
                style={{ position: "fixed", left: pos.left, top: pos.top, width: WIDTH }}
                className="z-[70] origin-top-right rounded-2xl border border-border bg-card p-1.5 text-sm shadow-lift"
              >
                <div className="flex items-center gap-3 px-2.5 pt-2 pb-2.5">
                  <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-coral-soft text-xs font-semibold text-coral-ink">{memberInitials(displayName)}</span>
                  <div className="min-w-0">
                    <p className="truncate font-medium">{displayName}</p>
                    <p className="text-xs text-muted-foreground">Your account</p>
                  </div>
                </div>
                <div className="mx-2 mb-1 hairline" />
                {ITEMS.map(({ href, label, hint, Icon }) => (
                  <Link key={href} href={href} role="menuitem" onClick={() => close()} className={ROW}>
                    <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0">
                      <span className="block truncate leading-tight">{label}</span>
                      <span className="block truncate text-xs leading-tight text-muted-foreground">{hint}</span>
                    </span>
                  </Link>
                ))}
                <div className="mx-2 my-1 hairline" />
                <button type="button" role="menuitem" onClick={() => void signOut().then(() => window.location.assign("/sign-in"))} className={ROW}>
                  <LogOut className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span>Sign out</span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
