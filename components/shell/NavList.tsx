"use client";

import { useId } from "react";
import { useRouter } from "next/navigation";
import { NavRow } from "@/components/shell/NavRow";
import { NAV as nav } from "@/components/shell/trip-nav";
import { useGuest } from "@/features/identity/ui/GuestProvider";

export function NavList({
  tripId,
  pathname,
  onNavigate,
  collapsed,
}: {
  tripId: string;
  pathname: string;
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  const base = `/trips/${tripId}`;
  const router = useRouter();
  const { guest, openGate } = useGuest();
  const pillId = useId();
  return (
    <nav className="space-y-0.5">
      {nav.map((item) => {
        const href = item.seg ? `${base}/${item.seg}` : base;
        const exact = "exact" in item ? item.exact : false;
        const isActive = exact ? pathname === base : pathname === href || pathname.startsWith(`${href}/`);
        // A guest gets Roam (the conversation) only; the rest is visible but closed.
        const locked = guest && item.seg !== "chat";
        return (
          <NavRow
            key={item.label}
            onLocked={locked ? () => { onNavigate?.(); openGate(`open ${item.label.toLowerCase()}`); } : undefined}
            href={href}
            label={item.label}
            icon={item.icon}
            active={isActive}
            collapsed={collapsed}
            pillId={pillId}
            onNavigate={onNavigate}
            onPrefetch={() => router.prefetch(href)}
          />
        );
      })}
    </nav>
  );
}
