"use client";

import { AnimatePresence, motion } from "motion/react";
import { BadgeCheck, Compass, Loader2, MapPin, Plane } from "lucide-react";
import { DestinationCombobox } from "@/components/DestinationCombobox";
import { LANGUAGES, countriesByName, displayName } from "@/lib/locales";
import { cn } from "@/lib/utils";
import type { useAccountForm } from "../application/useAccountForm";
import type { useDreamDestination } from "../application/useDreamDestination";
import type { useGoogleConnection } from "../application/useGoogleConnection";
import type { usePasswordChange } from "../application/usePasswordChange";
import { airportCode, canChangePassword, pickedAirport, readAirportInput } from "../domain/account";
import { Field, SettingSection } from "./AccountParts";

/** Profile & account: the dream destination, name, email, home, language, bio, password and the accounts connected. */
export function ProfileSection({ form, dream, password, google, email, emailVerified, clientReady, touch }: {
  form: ReturnType<typeof useAccountForm>;
  dream: ReturnType<typeof useDreamDestination>;
  password: ReturnType<typeof usePasswordChange>;
  google: ReturnType<typeof useGoogleConnection>;
  email: string;
  emailVerified: boolean;
  /** Language and country names come from the browser's Intl data, so those lists are built after hydration. */
  clientReady: boolean;
  touch: () => void;
}) {
  const { name, setName, emailDraft, setEmailDraft, airport, setAirport, airportText, setAirportText, city, changeCity, language, setLanguage, country, setCountry, countryChosen, bio, setBio, detected } = form;
  const { dreamText, dreamDraft, setDreamDraft, savingDream, dreamOpen, setDreamOpen, dreamSettled, setDreamSettled, chooseDream, clearDream } = dream;
  const { pwOpen, setPwOpen, newPw, setNewPw, confirmPw, setConfirmPw, savingPw, changePassword, pwScore, confirmMatches } = password;
  const { hasGoogle, connectingGoogle, toggleGoogle } = google;
  return (
    <SettingSection id="profile" title="Profile & account" blurb="How you appear to the people you plan with.">
      <div id="dream" className="scroll-mt-28">
      <AnimatePresence initial={false}>
      {dreamOpen && (
      <motion.div
        key="dream-box"
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: "auto" }}
        exit={{ opacity: 0, height: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        onAnimationComplete={() => dreamOpen && setDreamSettled(true)}
        className={dreamSettled ? undefined : "overflow-hidden"}
      >
      <div className="rounded-3xl bg-gradient-to-br from-muted/60 to-coral-soft/50 p-5 sm:p-6">
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="eyebrow flex items-center gap-1.5"><Compass className="h-3.5 w-3.5" /> Dream destination</p>
          <button type="button" onClick={() => setDreamOpen(false)} className="text-sm text-ink-soft underline-offset-2 hover:text-foreground hover:underline">Close</button>
        </div>
        <p className="font-display text-xl tracking-tight text-balance sm:text-2xl">Where would you go tomorrow?</p>
        <p className="mt-1 max-w-xl text-sm leading-relaxed text-ink-soft">Pick the place you keep coming back to. Its photo becomes the backdrop of your profile.</p>
        <div className="mt-4 flex max-w-xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <DestinationCombobox
              endpoint="/api/account/places/autocomplete"
              value={dreamDraft}
              onChange={setDreamDraft}
              onSelect={(text) => void chooseDream(text)}
              placeholder="Kyoto, Japan"
              disabled={savingDream}
              inputClassName="input-field"
            />
          </div>
          {savingDream && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-ink-soft" />}
        </div>
        {dreamText && (
          <p className="mt-3 flex flex-wrap items-center gap-x-3 text-sm text-ink-soft">
            <span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> {dreamText}</span>
            <button type="button" onClick={() => void clearDream()} className="underline-offset-2 hover:text-destructive hover:underline">Remove</button>
          </p>
        )}
      </div>
      </motion.div>
      )}
      </AnimatePresence>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <Field label="Full name">
          <input value={name} onChange={(e) => { setName(e.target.value); touch(); }} maxLength={80} className="input-field" />
        </Field>
        <Field label="Email" hint={emailVerified ? <span className="inline-flex items-center gap-1 text-xs text-coral"><BadgeCheck className="h-3.5 w-3.5" /> Verified</span> : undefined}>
          <input type="email" value={emailDraft} onChange={(e) => { setEmailDraft(e.target.value); touch(); }} className="input-field" />
        </Field>
        <Field label="Home airport">
          {/* Pick it by name ("pearson") and the code is saved; a bare code still works. Text that is neither goes back to what is saved. */}
          <div
            className="relative"
            onBlur={() => {
              if (airportText.trim() && !airportCode(airportText)) setAirportText(airport);
            }}
          >
            <Plane className="pointer-events-none absolute left-3 top-1/2 z-[1] h-4 w-4 -translate-y-1/2 text-ink-soft" />
            <DestinationCombobox
              endpoint="/api/account/airports"
              value={airportText}
              onChange={(text) => {
                const { shown, airport: next } = readAirportInput(text);
                setAirportText(shown);
                if (next !== null) setAirport(next);
                touch();
              }}
              onPick={(s) => {
                const picked = pickedAirport(s);
                setAirport(picked.airport);
                setAirportText(picked.shown);
                touch();
              }}
              onSelect={() => undefined}
              maxLength={80}
              selectOnFocus
              ariaLabel="Home airport"
              placeholder="Toronto Pearson, or YYZ"
              inputClassName="input-field pl-9"
            />
          </div>
        </Field>
        <Field label="Home city">
          <DestinationCombobox
            endpoint="/api/account/places/autocomplete"
            full
            value={city}
            onChange={changeCity}
            onSelect={changeCity}
            maxLength={120}
            selectOnFocus
            ariaLabel="Home city"
            placeholder="Toronto, Canada"
            inputClassName="input-field"
          />
        </Field>
        <Field label="Preferred language">
          <select value={language} onChange={(e) => { setLanguage(e.target.value); touch(); }} className="input-field">
            <option value="">Not set</option>
            {clientReady && LANGUAGES.map((code) => <option key={code} value={code}>{displayName("language", code, code)} ({displayName("language", code)})</option>)}
          </select>
        </Field>
        <Field label="Home country">
          <select value={country} onChange={(e) => { countryChosen.current = true; setCountry(e.target.value); touch(); }} className="input-field">
            <option value="">Not set</option>
            {clientReady && countriesByName().map((code) => <option key={code} value={code}>{displayName("region", code)}</option>)}
          </select>
        </Field>
        <p className="-mt-2 text-xs text-ink-soft sm:col-span-2">Roam replies in your language when a message doesn’t show one, and uses your country for passport, plug and currency tips.</p>
        {!language && !country && (detected.language || detected.country) && (
          <button type="button" onClick={() => { setLanguage(detected.language ?? ""); setCountry(detected.country ?? ""); touch(); }} className="justify-self-start text-left text-sm text-ink-soft underline-offset-4 hover:text-foreground hover:underline sm:col-span-2">
            Use what your browser says: {[detected.language && displayName("language", detected.language), detected.country && displayName("region", detected.country)].filter(Boolean).join(" · ")}
          </button>
        )}
        <div className="sm:col-span-2">
          <Field label="Short bio">
            <textarea rows={3} value={bio} onChange={(e) => { setBio(e.target.value); touch(); }} maxLength={280} className="input-field resize-none" />
          </Field>
        </div>
      </div>

      {/* Password */}
      <div className="rounded-3xl border border-border">
        <button type="button" onClick={() => setPwOpen((v) => !v)} className="flex w-full items-center justify-between gap-4 rounded-3xl px-5 py-4 text-left transition-colors hover:bg-accent/60 active:bg-accent">
          <span className="flex items-center gap-3">
            <span className="text-sm font-medium">Change password</span>
          </span>
          <span className="text-sm text-ink-soft">{pwOpen ? "Cancel" : "Update"}</span>
        </button>
        <AnimatePresence initial={false}>
          {pwOpen && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden">
              <div className="space-y-4 border-t border-border px-5 py-5">
                <Field label="New password">
                  <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="At least 8 characters" className="input-field" />
                </Field>
                <div className="flex gap-1.5">
                  {[0, 1, 2, 3].map((i) => <span key={i} className={cn("h-1 flex-1 rounded-full transition-colors", i < pwScore ? "bg-coral" : "bg-border")} />)}
                </div>
                <Field label="Confirm new password">
                  <input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} placeholder="Repeat it" className="input-field" />
                  {!confirmMatches && <p className="text-xs text-destructive">Doesn’t match yet.</p>}
                </Field>
                <button
                  type="button"
                  onClick={() => void changePassword()}
                  disabled={!canChangePassword(newPw, confirmPw) || savingPw}
                  className="inline-flex items-center gap-2 rounded-full bg-coral px-4 py-2 text-sm text-background transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {savingPw && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Update password
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Connected */}
      <div>
        <p className="eyebrow mb-3">Connected accounts</p>
        <div className="border-t border-border">
          {[{ name: "Google", connected: hasGoogle, action: () => void toggleGoogle(), busy: connectingGoogle }].map((c) => (
            <div key={c.name} className="flex items-center justify-between gap-4 border-b border-border py-4 last:border-b-0">
              <div>
                <p className="text-sm font-medium">{c.name}</p>
                <p className="text-sm text-ink-soft">{c.connected ? `Connected · ${email}` : "Not connected"}</p>
              </div>
              <button type="button" onClick={c.action} disabled={c.busy} className="text-sm text-ink-soft transition-colors hover:text-foreground disabled:opacity-50">
                {c.connected ? "Disconnect" : "Connect"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </SettingSection>
  );
}
