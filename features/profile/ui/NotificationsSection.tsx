"use client";

import { Copy, Eye, Link2 } from "lucide-react";
import type { useAccountActions } from "../application/useAccountActions";
import type { useAccountForm } from "../application/useAccountForm";
import { SettingSection, ToggleRow } from "./AccountParts";

/** Notifications & sharing: which messages to send, and the trips shared by link. */
export function NotificationsSection({ form, actions, sharedTrips, touch }: {
  form: ReturnType<typeof useAccountForm>;
  actions: ReturnType<typeof useAccountActions>;
  sharedTrips: Array<{ id: string; name: string; slug: string }>;
  touch: () => void;
}) {
  const { notif, setNotif } = form;
  const { copyShareLink, revokeShare } = actions;
  return (
    <SettingSection id="notifications" inline title="Notifications & sharing" blurb="What we tell you about, and who can see a trip.">
      <div className="border-t border-border">
        <ToggleRow title="Trip updates" note="When something you saved changes — hours, closures, a new review." checked={!!notif.trips} onChange={(v) => { setNotif({ ...notif, trips: v }); touch(); }} />
        <ToggleRow title="Price & weather changes" note="Fare and forecast moves on the dates you're holding." checked={!!notif.prices} onChange={(v) => { setNotif({ ...notif, prices: v }); touch(); }} />
        <ToggleRow title="Collaborator activity" note="When someone you invited edits or comments on a trip." checked={!!notif.collab} onChange={(v) => { setNotif({ ...notif, collab: v }); touch(); }} />
        <ToggleRow title="Weekly ideas" note="A short digest of places that match your travel style." checked={!!notif.weekly} onChange={(v) => { setNotif({ ...notif, weekly: v }); touch(); }} />
        <ToggleRow title="Product news" note="Occasional notes about new things in the workspace." checked={!!notif.product} onChange={(v) => { setNotif({ ...notif, product: v }); touch(); }} />
      </div>

      <div>
        <p className="eyebrow mb-3">Shared links</p>
        {sharedTrips.length ? (
          <div className="border-t border-border">
            {sharedTrips.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-4 last:border-b-0">
                <div className="flex items-center gap-3">
                  <Link2 className="h-4 w-4 text-ink-soft" />
                  <div>
                    <p className="text-sm font-medium">{s.name}</p>
                    <p className="flex items-center gap-1.5 text-sm text-ink-soft"><Eye className="h-3.5 w-3.5" /> Anyone with the link can view</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <button type="button" onClick={() => void copyShareLink(s.slug)} className="inline-flex items-center gap-1.5 text-ink-soft transition-colors hover:text-foreground">
                    <Copy className="h-3.5 w-3.5" /> Copy
                  </button>
                  <button type="button" onClick={() => void revokeShare(s.id)} className="text-ink-soft transition-colors hover:text-destructive">Revoke</button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-ink-soft">No trips are shared publicly right now.</p>
        )}
      </div>
    </SettingSection>
  );
}
