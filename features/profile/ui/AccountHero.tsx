"use client";

import { BadgeCheck, Camera, Compass, Loader2, Plane } from "lucide-react";
import { Reveal, Tactile, WordReveal } from "@/components/motion-primitives";
import { StandaloneTopBar } from "@/components/StandaloneTopBar";
import { memberInitials } from "@/lib/member-initials";
import { cn } from "@/lib/utils";
import type { useAvatarUpload } from "../application/useAvatarUpload";
import type { useDreamDestination } from "../application/useDreamDestination";

/** The opening of the account page: their dream destination (or a stock coast) behind their photo, name, home, bio and three numbers. */
export function AccountHero({ avatar, dream, name, city, bio, airport, emailVerified, tripCount, destinationCount, isDark }: {
  avatar: ReturnType<typeof useAvatarUpload>;
  dream: ReturnType<typeof useDreamDestination>;
  name: string;
  city: string;
  bio: string;
  airport: string;
  emailVerified: boolean;
  tripCount: number;
  destinationCount: number;
  /** Swaps the stock photo live when the Appearance toggle flips. */
  isDark: boolean;
}) {
  const { avatarUrl, avatarError, setAvatarError, uploadingAvatar, avatarInputRef, onAvatarChosen } = avatar;
  const { dreamText, openDream, setHeroFailed, dreamHero } = dream;
  return (
    <header className="relative isolate overflow-hidden bg-black text-white">
      {/* eslint-disable-next-line @next/next/no-img-element -- static design asset, sized by the container */}
      <img key={dreamHero ?? "stock"} src={dreamHero ?? (isDark ? "/design/land-lisbon-blue-hour.webp" : "/design/land-coast.jpg")} alt="" onError={() => setHeroFailed(true)} className="hero-drift absolute inset-0 h-full w-full object-cover" />
      <div aria-hidden className="absolute inset-0 scrim-v" />
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(85%_70%_at_12%_95%,rgba(0,0,0,0.6),transparent)]" />

      <div className="relative mx-auto flex min-h-[28rem] max-w-6xl flex-col justify-between gap-16 px-5 pt-7 pb-8 sm:min-h-[32rem] sm:px-8 sm:pb-10">
        <StandaloneTopBar photo />

        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end">
            <Tactile lift={4} className="relative w-fit">
              <div className="relative rounded-3xl border border-white/25 bg-white/10 p-1.5 shadow-lift backdrop-blur-md">
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  aria-label="Change photo"
                  className="group relative block h-24 w-24 overflow-hidden rounded-3xl bg-primary transition-[box-shadow,transform] duration-200 hover:shadow-lift active:scale-[0.985] sm:h-32 sm:w-32"
                >
                  {avatarUrl && !avatarError ? (
                    // eslint-disable-next-line @next/next/no-img-element -- external/user-uploaded, not a static asset
                    <img src={avatarUrl} alt="" className="h-full w-full object-cover" onError={() => setAvatarError(true)} />
                  ) : (
                    <span aria-hidden className="grid h-full w-full place-items-center font-display text-3xl font-semibold text-primary-foreground">
                      {memberInitials(name || "Traveller")}
                    </span>
                  )}
                  <span className="absolute inset-0 grid place-items-center bg-black/55 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
                    {uploadingAvatar ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <span className="flex flex-col items-center gap-1">
                        <Camera className="h-4 w-4" />
                        Change
                      </span>
                    )}
                  </span>
                </button>
                <input ref={avatarInputRef} type="file" accept="image/*" onChange={(e) => void onAvatarChosen(e)} className="hidden" />
              </div>
            </Tactile>

            <div className="min-w-0 pb-1">
              <p className="text-sm font-medium tracking-[0.14em] text-white/80 uppercase [text-shadow:0_1px_12px_rgba(0,0,0,0.6)]">Traveller profile</p>
              <WordReveal text={name || "Traveller"} delay={0.1} className="mt-2 font-display text-5xl leading-[0.98] tracking-tight text-balance [text-shadow:0_2px_30px_rgba(0,0,0,0.5)] sm:text-7xl" />
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/85">
                {city && (
                  <span className="inline-flex items-center gap-1.5">
                    <Plane className="h-4 w-4 opacity-70" />
                    {city}
                  </span>
                )}
                {emailVerified && (
                  <span className="inline-flex items-center gap-1.5">
                    <BadgeCheck className="h-4 w-4 opacity-70" /> Verified
                  </span>
                )}
                {dreamText ? (
                  <button type="button" onClick={openDream} title="Change your dream destination" className="inline-flex items-center gap-1.5 underline-offset-4 transition-opacity hover:underline">
                    <Compass className="h-4 w-4 opacity-70" /> Dreaming of {dreamText}
                  </button>
                ) : (
                  <button type="button" onClick={openDream} className="daisy-badge h-7 gap-1.5 border-white/30 bg-white/15 px-3 text-sm font-medium text-white backdrop-blur transition-colors hover:bg-white/25 max-sm:h-9 max-sm:px-4">
                    <Compass className="h-3.5 w-3.5" /> Add your dream destination
                  </button>
                )}
              </div>
              {bio && <p className="mt-3 max-w-xl text-body leading-relaxed text-white/80 [text-shadow:0_1px_14px_rgba(0,0,0,0.55)]">{bio}</p>}
            </div>
          </div>

          <Reveal delay={0.3}>
            <div className="max-lg:hidden daisy-stats w-full rounded-2xl border border-white/20 bg-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] backdrop-blur-md lg:w-auto [&_.daisy-stat-desc]:text-white/70 [&_.daisy-stat-title]:text-white/70 [&>.daisy-stat]:min-w-0 [&>.daisy-stat]:border-white/20 [&>.daisy-stat]:px-5 [&>.daisy-stat]:py-3 max-sm:[&>.daisy-stat]:px-3 max-sm:[&_.daisy-stat-title]:tracking-[0.06em]">
              {[
                { label: "Trips planned", value: String(tripCount) },
                { label: "Places", value: String(destinationCount) },
                { label: "Home airport", value: airport || "Not set" },
              ].map((m) => (
                <div key={m.label} className="daisy-stat">
                  <div className="daisy-stat-title text-2xs tracking-[0.1em] uppercase">{m.label}</div>
                  <div className={cn("daisy-stat-value font-display text-2xl tracking-tight tabular-nums sm:text-3xl", !airport && m.label === "Home airport" && "opacity-60")}>{m.value}</div>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </div>
    </header>
  );
}
