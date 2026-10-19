"use client";

// TEMPORARY (phone redesign): the trip shell as a guest or a member, from fixtures. `?guest=1`.
import React from "react";
import { TripDataProvider } from "@/components/TripDataProvider";
import { PhoneDrawer } from "@/components/shell/PhoneDrawer";
import { PhoneHeader, PhoneHeaderProvider } from "@/components/shell/PhoneHeader";
import { GuestProvider } from "@/features/identity/ui/GuestProvider";

const TRIP = "00000000-0000-0000-0000-000000000000";
const trip = { name: "Toronto → New York → Rome → Paris → Amsterdam → London", destination: "London", dates: "20 days", travellers: "5 travellers" };

export function ShellClient({ guest, open }: { guest: boolean; open: boolean }) {
  return (
    <GuestProvider guest={guest} tripId={TRIP}>
      <TripDataProvider tripId={TRIP} data={null}>
        <PhoneHeaderProvider>
          <div className="min-h-screen bg-background text-foreground">
            <PhoneHeader pathname={`/trips/${TRIP}/chat`} tripId={TRIP} tripName={trip.name} onMenu={() => undefined} />
            <p className="p-4 text-sm text-muted-foreground">{guest ? "Guest" : "Member"} view</p>
          </div>
          <PhoneDrawer open={open} onClose={() => undefined} tripId={TRIP} pathname={`/trips/${TRIP}/chat`} trip={trip} unread={guest ? 0 : 3} />
        </PhoneHeaderProvider>
      </TripDataProvider>
    </GuestProvider>
  );
}
