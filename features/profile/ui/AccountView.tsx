"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ChangeEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { BadgeCheck, Camera, Check, ChevronRight, Copy, Download, Eye, Link2, Loader2, MapPin, Plane, Compass, Trash2 } from "lucide-react";
import { Reveal, Sheet, Tactile, WordReveal, motionTokens } from "@/components/motion-primitives";
import { StandaloneTopBar } from "@/components/StandaloneTopBar";
import { useIsDarkMode } from "@/lib/use-dark-mode";
import { DestinationCombobox } from "@/components/DestinationCombobox";
import { accountPhotoUrl } from "@/lib/places-ui";
import { notifyToast } from "@/lib/application/toast";
import { PHONE_V2 } from "@/lib/phone-v2";
import { haptic } from "@/lib/haptics";
import { useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import { COUNTRIES, LANGUAGES, countryFromPlace, displayName, fromBrowserLocale } from "@/lib/locales";
import { updateName, updateEmail, updatePassword, disconnectGoogle, signInWithGoogle, signOut as signOutUser, uploadAvatar } from "@/features/identity/application/authClient";
import type { TravelerProfile } from "@/packages/contracts/profile";
import { memberInitials } from "@/lib/member-initials";

/** What the avatars bucket accepts (it enforces the same list on the server). */
const AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif", "image/heic", "image/heif"];

const SECTIONS = [
  { id: "profile", label: "Profile & account" },
  { id: "style", label: "Travel style" },
  { id: "notifications", label: "Notifications & sharing" },
  { id: "danger", label: "Account data" },
] as const;

const INTERESTS = ["Food & markets", "Hiking", "Museums", "Nightlife", "Architecture", "Beaches", "Wildlife", "Coffee", "Live music", "Photography", "Wine", "Design shops"];
const DIETARY = ["Vegetarian", "Vegan", "Halal", "Gluten-free", "Nut allergy", "Pescatarian"];
const PACE = [
  { label: "Slow", note: "Two or three things a day, long lunches, room to wander." },
  { label: "Balanced", note: "A morning plan and an evening plan, afternoons left open." },
  { label: "Packed", note: "Full days, early starts, as much as the map allows." },
];
const BUDGET = [
  { label: "Lean", note: "Hostels, street food and free things worth queueing for." },
  { label: "Considered", note: "Good value stays, one memorable meal per city." },
  { label: "Comfortable", note: "Central rooms, table service, the odd splurge." },
  { label: "Generous", note: "Design hotels, tasting menus, private guides." },
];
const STAY_TYPES = ["Hotel", "Apartment", "Guesthouse", "Anything"];
const COMPANIONS = ["Solo", "Partner", "Friends", "Family"];
const UNSET_NOTE = "Not set. Roam won\u2019t assume one until you choose.";

/* --------------------------------- pieces -------------------------------- */

function SettingSection({ id, title, blurb, action, inline = false, children }: { id: string; title: string; blurb: string; action?: ReactNode; /** Phone redesign: stays on the page (the notification switches) instead of opening in a sheet. */ inline?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const narrow = useMediaQuery("(max-width: 1023.98px)");
  const phone = PHONE_V2 && narrow;
  if (phone && !inline) {
    return (
      <section id={id} className="scroll-mt-28">
        <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" className="flex min-h-[4.25rem] w-full items-center gap-3.5 border-b border-hairline py-2 text-left">
          <span className="min-w-0 flex-1">
            <b className="block font-display text-base leading-tight font-medium tracking-[-0.01em]">{title}</b>
            <span className="text-sm text-ink-soft">{blurb}</span>
          </span>
          <ChevronRight className="size-[1.125rem] shrink-0 text-muted-foreground" aria-hidden />
        </button>
        <Sheet open={open} onClose={() => setOpen(false)} side="bottom" ariaLabel={title} className="rounded-t-[1.75rem] bg-background px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <p className="pb-3 font-display text-xl font-medium tracking-[-0.02em]">{title}</p>
          <div className="min-h-0 flex-1 space-y-8 overflow-y-auto pb-2">{children}</div>
        </Sheet>
      </section>
    );
  }
  if (phone && inline) {
    return (
      <section id={id} className="scroll-mt-28 pt-6">
        <h2 className="font-display text-xl font-medium tracking-[-0.02em]">{title}</h2>
        <p className="mt-1 text-sm text-ink-soft">{blurb}</p>
        <div className="mt-2 space-y-6">{children}</div>
      </section>
    );
  }
  return (
    <section id={id} className="scroll-mt-28">
      <Reveal y={18}>
       <div className="rounded-3xl border border-border/70 bg-card p-6 shadow-soft sm:p-9">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="font-display text-2xl tracking-tight sm:text-3xl">{title}</h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-soft">{blurb}</p>
          </div>
          {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
        </div>
        <div className="mt-8 space-y-8">{children}</div>
       </div>
      </Reveal>
    </section>
  );
}

function Pill({ children }: { children: ReactNode }) {
  return <span className="rounded-full border border-border bg-surface px-3.5 py-1.5 text-sm text-foreground">{children}</span>;
}

/** A level shown as filled steps ("Generous" = 4 of 4), so pace and budget read at a glance. */
function Meter({ value, max }: { value: number; max: number }) {
  return (
    <span aria-hidden className="flex gap-1">
      {Array.from({ length: max }, (_, i) => <span key={i} className={cn("h-1.5 w-6 rounded-full transition-colors", i <= value ? "bg-coral" : "bg-border")} />)}
    </span>
  );
}

function ReadRow({ label, value, note, level }: { label: string; value: string; note?: string; level?: { value: number; max: number } }) {
  return (
    <div className="rounded-2xl bg-muted/50 p-4">
      <p className="eyebrow mb-2">{label}</p>
      <p className="flex items-center justify-between gap-3 font-display text-xl tracking-tight text-foreground">
        {value}
        {level && <Meter value={level.value} max={level.max} />}
      </p>
      {note ? <p className="mt-1 text-sm text-ink-soft">{note}</p> : null}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <label className="text-xs font-medium tracking-wide text-ink-soft">{label}</label>
        {hint}
      </div>
      {children}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.94 }}
      transition={{ type: "spring", stiffness: 420, damping: 24 }}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
        active ? "border-transparent bg-coral text-background" : "border-border bg-background text-ink-soft hover:border-ink/25 hover:text-foreground",
      )}
    >
      {children}
    </motion.button>
  );
}

/** `clearable`: choosing the chosen one again unchooses it, so a preference can go back to "not set". */
function Segmented({ options, value, onChange, clearable }: { options: string[]; value: string; onChange: (v: string) => void; clearable?: boolean }) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-full border border-border bg-surface p-1">
      {options.map((o) => (
        <button key={o} type="button" onClick={() => onChange(clearable && value === o ? "" : o)} className="relative rounded-full px-3.5 py-1.5 text-sm transition-colors">
          {value === o && (
            <motion.span layoutId={`seg-${options.join("")}`} className="absolute inset-0 rounded-full bg-primary" transition={{ type: "spring", stiffness: 380, damping: 30 }} />
          )}
          <span className={cn("relative", value === o ? "text-primary-foreground" : "text-ink-soft")}>{o}</span>
        </button>
      ))}
    </div>
  );
}

function ToggleSwitch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => { haptic("select"); onChange(!checked); }}
      className={cn("relative mt-0.5 h-6 w-10 shrink-0 rounded-full transition-colors before:absolute before:-inset-2.5 before:content-['']", checked ? "bg-coral" : "bg-border")}
    >
      <motion.span
        className="absolute top-0.5 h-5 w-5 rounded-full bg-background shadow-soft"
        animate={{ left: checked ? "18px" : "2px" }}
        transition={{ type: "spring", stiffness: 500, damping: 32 }}
      />
    </button>
  );
}

function ToggleRow({ title, note, checked, onChange }: { title: string; note: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-6 border-b border-border py-4 last:border-b-0">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-0.5 text-sm text-ink-soft">{note}</p>
      </div>
      <ToggleSwitch checked={checked} onChange={onChange} label={title} />
    </div>
  );
}

function strengthOf(pw: string) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return s;
}

const asDietaryArray = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : typeof v === "string" && v ? [v] : []);

/* ---------------------------------- page --------------------------------- */

export function AccountView({
  userId,
  initialName,
  avatarUrl: initialAvatarUrl,
  email,
  emailVerified,
  tripCount,
  destinationCount,
  providers,
  profile,
  sharedTrips,
}: {
  userId: string;
  initialName: string;
  avatarUrl: string | null;
  email: string;
  emailVerified: boolean;
  tripCount: number;
  destinationCount: number;
  providers: string[];
  profile: TravelerProfile;
  sharedTrips: Array<{ id: string; name: string; slug: string }>;
}) {
  const router = useRouter();
  const [active, setActive] = useState<string>("profile");
  // The rail follows the page: the section whose top has passed about a third of the way down the window is the one you are in.
  // A click on the rail sets the section itself and holds it for a moment, so the pill does not flicker through the ones scrolled past.
  const railLock = useRef(0);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      if (Date.now() < railLock.current) return;
      const sections = SECTIONS.map((s) => document.getElementById(s.id)).filter((el): el is HTMLElement => !!el);
      if (!sections.length) return;
      const line = window.innerHeight * 0.35;
      let current = sections[0].id;
      for (const el of sections) if (el.getBoundingClientRect().top <= line) current = el.id;
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) current = sections[sections.length - 1].id;
      setActive(current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  const reduce = useReducedMotion();
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [styleSaved, setStyleSaved] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [avatarError, setAvatarError] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Swaps the hero photo live when the Appearance toggle further down this page flips.
  const isDark = useIsDarkMode();
  // Language and country names come from the browser's Intl data, which the server's copy words and orders
  // differently ("Hong Kong" vs "Hong Kong SAR China"), so those lists are built after hydration, not during it.
  const clientReady = useSyncExternalStore(() => () => undefined, () => true, () => false);

  async function onAvatarChosen(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!AVATAR_TYPES.includes(file.type)) { notifyToast("Choose a JPEG, PNG, WebP, GIF or HEIC photo.", "error"); return; }
    if (file.size > 5 * 1024 * 1024) { notifyToast("Keep it under 5MB.", "error"); return; }
    setUploadingAvatar(true);
    const { error, url } = await uploadAvatar(userId, file);
    setUploadingAvatar(false);
    if (error || !url) { notifyToast("That photo couldn’t be uploaded.", "error"); return; }
    setAvatarUrl(url);
    setAvatarError(false);
    notifyToast("Photo updated", "success");
  }
  const touch = () => { setDirty(true); setSaved(false); };

  // The dream destination: its photo is the profile picture and the backdrop of this page.
  const [dreamText, setDreamText] = useState(profile.dreamDestination ?? "");
  const [dreamDraft, setDreamDraft] = useState(profile.dreamDestination ?? "");
  const [dreamPhoto, setDreamPhoto] = useState<string | null>(profile.dreamPhotoName ?? null);
  const [savingDream, setSavingDream] = useState(false);
  // The picker stays out of the way until asked for: from the profile header's "Add your dream destination" or the one set already.
  const [dreamOpen, setDreamOpen] = useState(false);
  // overflow-hidden is only needed while the card's height is animating open/closed — left on permanently,
  // it also clips the destination combobox's dropdown, which has to float past the card's bottom edge.
  const [dreamSettled, setDreamSettled] = useState(false);
  useEffect(() => { if (!dreamOpen) setDreamSettled(false); }, [dreamOpen]);
  const openDream = () => {
    setActive("profile");
    setDreamOpen(true);
    window.setTimeout(() => document.getElementById("dream")?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
  };
  const [heroFailed, setHeroFailed] = useState(false);
  const dreamHero = dreamPhoto && !heroFailed ? accountPhotoUrl(dreamPhoto, 1600) : undefined;

  const [name, setName] = useState(initialName);
  const [emailDraft, setEmailDraft] = useState(email);
  const [airport, setAirport] = useState(profile.homeAirport ?? "");
  const [airportText, setAirportText] = useState(profile.homeAirport ?? "");
  const [city, setCity] = useState(profile.homeCity ?? "");
  const [bio, setBio] = useState(profile.bio ?? "");
  const [language, setLanguage] = useState(profile.language ?? "");
  const [country, setCountry] = useState(profile.country ?? "");
  // Once the traveller picks a country themselves, typing a city no longer changes it.
  const countryChosen = useRef(Boolean(profile.country));
  const changeCity = (value: string) => {
    setCity(value);
    // A city that names its country sets the home country, until the traveller sets it by hand.
    const named = countryFromPlace(value);
    if (named && !countryChosen.current) setCountry(named);
    touch();
  };
  /** The three-letter code in what was typed or picked: "YYZ", or "Toronto Pearson International Airport (YYZ)". */
  const airportCode = (text: string): string | null => {
    const v = text.trim();
    if (/^[A-Za-z]{3}$/.test(v)) return v.toUpperCase();
    return /\(([A-Za-z]{3})\)\s*$/.exec(v)?.[1]?.toUpperCase() ?? null;
  };
  const [detected, setDetected] = useState<{ language?: string; country?: string }>({});
  useEffect(() => setDetected(fromBrowserLocale(navigator.language)), []);
  // A home city saved without a country: the city already says which, so fill it in and keep it.
  useEffect(() => {
    const named = !profile.country ? countryFromPlace(profile.homeCity) : undefined;
    if (!named) return;
    setCountry(named);
    void fetch("/api/profile", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ country: named }) }).then((r) => {
      if (r.ok) notifyToast(`Home country set to ${displayName("region", named)}, from your home city.`, "success");
    });
  }, [profile.country, profile.homeCity]);
  const [pwOpen, setPwOpen] = useState(false);
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [savingPw, setSavingPw] = useState(false);
  const [hasGoogle, setHasGoogle] = useState(providers.includes("google"));
  const [connectingGoogle, setConnectingGoogle] = useState(false);

  const [interests, setInterests] = useState<string[]>(profile.interests ?? []);
  const [dietary, setDietary] = useState<string[]>(asDietaryArray(profile.dietaryNeeds));
  const [dietNote, setDietNote] = useState(profile.dietaryNote ?? "");
  const [pace, setPace] = useState(() => PACE.findIndex((p) => p.label === profile.pace));
  const [budget, setBudget] = useState(() => BUDGET.findIndex((b) => b.label === String(profile.budget ?? "")));
  const [stay, setStay] = useState(profile.stayType ?? "Anything");
  const [companions, setCompanions] = useState(profile.groupType ?? "");
  const [editingStyle, setEditingStyle] = useState(false);
  const styleSnapshot = useMemo(() => ({ interests, dietary, dietNote, pace, budget, stay, companions }), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [snapshot, setSnapshot] = useState(styleSnapshot);

  const startStyleEdit = () => { setSnapshot({ interests, dietary, dietNote, pace, budget, stay, companions }); setStyleSaved(false); setEditingStyle(true); };
  const cancelStyleEdit = () => {
    setInterests(snapshot.interests); setDietary(snapshot.dietary); setDietNote(snapshot.dietNote);
    setPace(snapshot.pace); setBudget(snapshot.budget); setStay(snapshot.stay); setCompanions(snapshot.companions);
    setEditingStyle(false);
  };
  const [savingStyle, setSavingStyle] = useState(false);
  async function finishStyleEdit() {
    setSavingStyle(true);
    const ok = await saveProfile({ interests, dietaryNeeds: dietary, dietaryNote: dietNote || undefined, pace: PACE[pace]?.label ?? null, budget: BUDGET[budget]?.label ?? null, stayType: stay, groupType: companions || null } as Partial<TravelerProfile>); // null clears one that was set
    setSavingStyle(false);
    if (ok) { setStyleSaved(true); setEditingStyle(false); }
  }

  const [notif, setNotif] = useState({ trips: true, prices: true, collab: true, weekly: false, product: false, ...profile.notifications });
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  const toggleChip = (list: string[], set: (v: string[]) => void, v: string) => { touch(); set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]); };

  async function saveProfile(patch: Partial<TravelerProfile>): Promise<boolean> {
    try {
      const response = await fetch("/api/profile", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) });
      if (!response.ok) throw new Error();
      return true;
    } catch {
      notifyToast("That couldn’t be saved. Try again.", "error");
      return false;
    }
  }

  /** Pick the dream destination: look up its photo once, then save both so the page and profile picture update together. */
  async function chooseDream(text: string) {
    const place = text.trim();
    if (!place || savingDream) return;
    setSavingDream(true);
    try {
      const res = await fetch(`/api/account/places/destination-photo?query=${encodeURIComponent(place)}`);
      const body = res.ok ? ((await res.json()) as { photoName?: string | null }) : { photoName: null };
      const photoName = body.photoName ?? null;
      const ok = await saveProfile({ dreamDestination: place, dreamPhotoName: photoName });
      if (!ok) return;
      setDreamText(place);
      setDreamDraft(place);
      setDreamPhoto(photoName);
      setHeroFailed(false);
      setDreamOpen(false);
      notifyToast(photoName ? "Your dream destination is your backdrop now." : "Saved. We couldn’t find a photo for it, though.", photoName ? "success" : "info");
    } finally {
      setSavingDream(false);
    }
  }

  async function clearDream() {
    if (savingDream) return;
    setSavingDream(true);
    const ok = await saveProfile({ dreamDestination: null, dreamPhotoName: null });
    setSavingDream(false);
    if (!ok) return;
    setDreamText("");
    setDreamDraft("");
    setDreamPhoto(null);
  }

  async function saveAll() {
    if (saving) return;
    setSaving(true);
    try {
      if (name.trim() && name !== initialName) {
        const { error } = await updateName(name.trim());
        if (error) throw new Error("name");
      }
      if (emailDraft.trim() && emailDraft !== email) {
        const { error } = await updateEmail(emailDraft.trim());
        if (error) throw new Error("email");
        notifyToast("Check your inbox to confirm the new email.", "success");
      }
      const ok = await saveProfile({ homeAirport: airport || undefined, homeCity: city || undefined, language: language || undefined, country: country || undefined, bio: bio || undefined, notifications: notif });
      if (!ok) throw new Error("profile");
      setDirty(false);
      setSaved(true);
      router.refresh();
    } catch {
      notifyToast("Some changes couldn’t be saved. Try again.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function changePassword() {
    if (newPw.length < 8 || newPw !== confirmPw || savingPw) return;
    setSavingPw(true);
    const { error } = await updatePassword(newPw);
    setSavingPw(false);
    if (error) { notifyToast("Your password couldn’t be changed.", "error"); return; }
    notifyToast("Password changed", "success");
    setNewPw(""); setConfirmPw(""); setPwOpen(false);
  }

  async function toggleGoogle() {
    setConnectingGoogle(true);
    if (hasGoogle) {
      const { error } = await disconnectGoogle();
      setConnectingGoogle(false);
      if (error) { notifyToast("Couldn’t disconnect Google.", "error"); return; }
      setHasGoogle(false);
      notifyToast("Google disconnected", "success");
    } else {
      await signInWithGoogle(window.location.href);
    }
  }

  async function copyShareLink(slug: string) {
    const url = `${window.location.origin}/s/${slug}`;
    try { await navigator.clipboard.writeText(url); notifyToast("Link copied", "success"); } catch { notifyToast("Couldn’t copy the link.", "error"); }
  }

  async function revokeShare(tripId: string) {
    const response = await fetch(`/api/trips/${tripId}/share`, { method: "DELETE" });
    if (!response.ok) { notifyToast("Couldn’t revoke that link.", "error"); return; }
    notifyToast("Link revoked", "success");
    router.refresh();
  }

  async function exportData() {
    window.location.href = "/api/account/export";
  }

  async function deleteAccount() {
    setDeleting(true);
    const response = await fetch("/api/account", { method: "DELETE" });
    if (!response.ok) { setDeleting(false); notifyToast("Account could not be deleted.", "error"); return; }
    window.location.assign("/sign-in");
  }

  const summary = useMemo(() => {
    const top = interests.slice(0, 3).join(", ").toLowerCase() || "whatever looks good";
    // Only what was actually chosen: a pace, budget or company left unset is not assumed.
    const parts = [
      PACE[pace] && `at a ${PACE[pace]!.label.toLowerCase()} pace`,
      BUDGET[budget] && `on a ${BUDGET[budget]!.label.toLowerCase()} budget`,
      companions && `usually travelling ${companions.toLowerCase() === "solo" ? "solo" : `with ${companions.toLowerCase()}`}`,
    ].filter(Boolean);
    return `New trips will lean towards ${top}${parts.length ? `, ${parts.join(", ")}` : ""}.`;
  }, [interests, pace, budget, companions]);

  const pwScore = strengthOf(newPw);
  const confirmMatches = confirmPw.length === 0 || confirmPw === newPw;

  return (
    <div className="min-h-screen pb-32">
      {/* The opening frame: their dream destination when they have set one, otherwise a coastal road by day and Lisbon at blue hour by night,
       * slowly pushing in, graded dark so the white name and the frosted numbers always read. */}
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
                    className="group relative block h-24 w-24 overflow-hidden rounded-3xl bg-primary transition-[box-shadow,transform] duration-200 hover:shadow-lift active:scale-[0.98] sm:h-32 sm:w-32"
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
              <div className={cn(PHONE_V2 && "max-lg:hidden", "daisy-stats w-full rounded-2xl border border-white/20 bg-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] backdrop-blur-md lg:w-auto [&_.daisy-stat-desc]:text-white/70 [&_.daisy-stat-title]:text-white/70 [&>.daisy-stat]:min-w-0 [&>.daisy-stat]:border-white/20 [&>.daisy-stat]:px-5 [&>.daisy-stat]:py-3 max-sm:[&>.daisy-stat]:px-3 max-sm:[&_.daisy-stat-title]:tracking-[0.06em]")}>
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

      <div className="mx-auto max-w-6xl px-5 sm:px-8">

        {/* Rail + body */}
        <div className="mt-10 gap-10 lg:grid lg:grid-cols-[200px_minmax(0,1fr)]">
          <nav className={cn(PHONE_V2 && "max-lg:hidden", "sticky top-0 z-20 -mx-5 mb-8 overflow-x-auto overscroll-x-contain border-b border-border bg-background/95 px-5 py-3 scrollbar-slim sm:-mx-8 sm:px-8 lg:top-10 lg:mx-0 lg:mb-0 lg:self-start lg:overflow-visible lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none")}>
            <ul className="flex gap-2 lg:flex-col lg:gap-1">
              {SECTIONS.map((s) => (
                <li key={s.id} className="shrink-0">
                  <a
                    href={`#${s.id}`}
                    onClick={() => {
                      railLock.current = Date.now() + 900;
                      setActive(s.id);
                    }}
                    className={cn("relative block whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm transition-colors", active === s.id ? "text-foreground" : "text-ink-soft hover:text-foreground")}
                  >
                    {active === s.id && <motion.span layoutId="profile-nav-pill" className="absolute inset-0 rounded-full bg-secondary" transition={{ type: "spring", stiffness: 380, damping: 32 }} />}
                    <span className="relative">{s.label}</span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="space-y-8">
            {/* Profile & account */}
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
                        const code = airportCode(text);
                        setAirportText(/^[A-Za-z]{3}$/.test(text.trim()) ? text.trim().toUpperCase() : text);
                        if (!text.trim()) setAirport("");
                        else if (code) setAirport(code);
                        touch();
                      }}
                      onPick={(s) => {
                        setAirport(s.placeId);
                        setAirportText(s.text.includes(`(${s.placeId})`) ? s.text : `${s.text} (${s.placeId})`);
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
                    {clientReady && [...COUNTRIES].sort((a, b) => displayName("region", a).localeCompare(displayName("region", b))).map((code) => <option key={code} value={code}>{displayName("region", code)}</option>)}
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
                          disabled={newPw.length < 8 || newPw !== confirmPw || savingPw}
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

            {/* Travel style */}
            <SettingSection
              id="style"
              title="Travel style"
              blurb="What personalises Discover — new trips start tuned to this."
              action={
                editingStyle ? (
                  <>
                    <button type="button" onClick={cancelStyleEdit} className="rounded-full border border-border px-4 py-1.5 text-sm text-ink-soft transition-colors hover:border-ink/25 hover:text-foreground">Cancel</button>
                    <button type="button" onClick={() => void finishStyleEdit()} disabled={savingStyle} className="inline-flex items-center gap-2 rounded-full bg-coral px-4 py-1.5 text-sm text-background transition-opacity hover:opacity-90 disabled:opacity-60">
                      {savingStyle && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      Done
                    </button>
                  </>
                ) : (
                  <button type="button" onClick={startStyleEdit} className="rounded-full border border-border px-4 py-1.5 text-sm text-foreground transition-colors hover:border-ink/25">Edit</button>
                )
              }
            >
              <AnimatePresence mode="wait" initial={false}>
                {editingStyle ? (
                  <motion.div key="edit" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }} className="space-y-8">
                    <div>
                      <p className="eyebrow mb-3">Interests</p>
                      <div className="flex flex-wrap gap-2">
                        {INTERESTS.map((i) => <Chip key={i} active={interests.includes(i)} onClick={() => toggleChip(interests, setInterests, i)}>{i}</Chip>)}
                      </div>
                    </div>

                    <div className="grid gap-8 sm:grid-cols-2">
                      <div>
                        <p className="eyebrow mb-4">Pace</p>
                        <Segmented clearable options={PACE.map((p) => p.label)} value={PACE[pace]?.label ?? ""} onChange={(v) => { setPace(PACE.findIndex((p) => p.label === v)); touch(); }} />
                        <p className="mt-3 text-sm text-ink-soft">{PACE[pace]?.note ?? UNSET_NOTE}</p>
                      </div>
                      <div>
                        <p className="eyebrow mb-4">Budget</p>
                        <Segmented clearable options={BUDGET.map((b) => b.label)} value={BUDGET[budget]?.label ?? ""} onChange={(v) => { setBudget(BUDGET.findIndex((b) => b.label === v)); touch(); }} />
                        <p className="mt-3 text-sm text-ink-soft">{BUDGET[budget]?.note ?? UNSET_NOTE}</p>
                      </div>
                    </div>

                    <div>
                      <p className="eyebrow mb-3">Dietary needs</p>
                      <div className="flex flex-wrap gap-2">
                        {DIETARY.map((d) => <Chip key={d} active={dietary.includes(d)} onClick={() => toggleChip(dietary, setDietary, d)}>{d}</Chip>)}
                      </div>
                      <input className="input-field mt-3 max-w-md" placeholder="Anything else we should know?" value={dietNote} onChange={(e) => { setDietNote(e.target.value); touch(); }} />
                    </div>

                    <div className="grid gap-8 sm:grid-cols-2">
                      <div>
                        <p className="eyebrow mb-3">Preferred stay</p>
                        <Segmented options={STAY_TYPES} value={stay} onChange={(v) => { setStay(v); touch(); }} />
                      </div>
                      <div>
                        <p className="eyebrow mb-3">Usually travelling</p>
                        <Segmented clearable options={COMPANIONS} value={companions} onChange={(v) => { setCompanions(v); touch(); }} />
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div key="view" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }} className="space-y-8">
                    <div className="rounded-3xl bg-gradient-to-br from-muted/60 to-coral-soft/50 p-6">
                      <p className="eyebrow mb-2">In a sentence</p>
                      <p className="font-display text-xl leading-snug tracking-tight text-balance sm:text-2xl">{summary}</p>
                    </div>
                    <div>
                      <p className="eyebrow mb-3">Interests</p>
                      {interests.length ? (
                        <div className="flex flex-wrap gap-2">{interests.map((i) => <Pill key={i}>{i}</Pill>)}</div>
                      ) : (
                        <p className="text-sm text-ink-soft">No interests picked yet. <button type="button" onClick={startStyleEdit} className="text-coral hover:underline">Add some</button></p>
                      )}
                    </div>

                    <div className="grid gap-8 sm:grid-cols-2">
                      <ReadRow label="Pace" value={PACE[pace]?.label ?? "Not set"} note={PACE[pace]?.note ?? UNSET_NOTE} level={PACE[pace] ? { value: pace, max: PACE.length } : undefined} />
                      <ReadRow label="Budget" value={BUDGET[budget]?.label ?? "Not set"} note={BUDGET[budget]?.note ?? UNSET_NOTE} level={BUDGET[budget] ? { value: budget, max: BUDGET.length } : undefined} />
                    </div>

                    <div>
                      <p className="eyebrow mb-3">Dietary needs</p>
                      {dietary.length ? <div className="flex flex-wrap gap-2">{dietary.map((d) => <Pill key={d}>{d}</Pill>)}</div> : <p className="text-sm text-ink-soft">Nothing to avoid.</p>}
                      {dietNote ? <p className="mt-3 text-sm text-ink-soft">{dietNote}</p> : null}
                    </div>

                    <div className="grid gap-8 sm:grid-cols-2">
                      <ReadRow label="Preferred stay" value={stay} />
                      <ReadRow label="Usually travelling" value={companions || "Not set"} />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence initial={false}>
                {styleSaved && (
                  <motion.div initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.98 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }} className="rounded-2xl border border-coral/25 bg-coral-soft/50 px-5 py-4">
                    <p className="eyebrow mb-1">Travel style saved</p>
                    <p className="text-sm leading-relaxed text-foreground">From now on, {summary}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </SettingSection>

            {/* Notifications & sharing */}
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

            {/* Danger */}
            <SettingSection id="danger" title="Account data" blurb="Take your planning with you, sign out, or close the account.">
              <div className="flex flex-wrap items-center gap-3 border-b border-border pb-6">
                <div className="mr-auto">
                  <p className="text-sm font-medium">Sign out</p>
                  <p className="text-sm text-ink-soft">Ends this session on this device.</p>
                </div>
                <button type="button" onClick={() => void signOutUser().then(() => window.location.assign("/sign-in"))} className="rounded-full border border-border px-4 py-2 text-sm transition-colors hover:bg-secondary active:scale-[0.98]">Sign out</button>
              </div>

              <div className="flex flex-wrap items-center gap-3 border-b border-border pb-6">
                <Download className="h-4 w-4 text-ink-soft" />
                <div className="mr-auto">
                  <p className="text-sm font-medium">Export my data</p>
                  <p className="text-sm text-ink-soft">Every trip, itinerary item and saved place as a single file.</p>
                </div>
                <button type="button" onClick={() => void exportData()} className="rounded-full border border-border px-4 py-2 text-sm transition-colors hover:bg-secondary active:scale-[0.98]">Export</button>
              </div>

              <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 px-5 py-5">
                <Trash2 className="h-4 w-4 text-destructive" />
                <div className="mr-auto">
                  <p className="text-sm font-medium text-destructive">Delete account</p>
                  <p className="text-sm text-ink-soft">Your account and your own details go. Trips you share with friends stay with them and pass to the next member; trips only you are on are deleted. This can’t be undone.</p>
                </div>
                <button type="button" onClick={() => setDeleteOpen(true)} className="btn-destructive">Delete</button>
              </div>
            </SettingSection>
          </div>
        </div>
      </div>

      <Sheet open={deleteOpen} onClose={() => setDeleteOpen(false)} ariaLabel="Delete your account">
        <div className="space-y-4 p-6">
          <div>
            <h3 className="font-display text-xl">Delete your account?</h3>
            <p className="mt-1 text-sm text-ink-soft">Trips you share with friends stay with them (the next member takes over). Trips only you are on, with their itinerary and shared links, are removed. Type DELETE to confirm.</p>
          </div>
          <input value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)} placeholder="DELETE" className="input-field" />
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setDeleteOpen(false)} className="rounded-full border border-border px-4 py-2 text-sm transition-colors hover:bg-secondary active:scale-[0.98]">Keep my account</button>
            <button
              type="button"
              onClick={() => void deleteAccount()}
              disabled={deleteConfirm !== "DELETE" || deleting}
              className="btn-destructive"
            >
              {deleting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Delete my account
            </button>
          </div>
        </div>
      </Sheet>

      {/* Save bar */}
      <AnimatePresence>
        {dirty && (
          <motion.div initial={reduce ? false : { y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={reduce ? undefined : { y: 80, opacity: 0 }} transition={reduce ? { duration: 0 } : motionTokens.panelSpring} className="fixed inset-x-0 bottom-0 z-40 px-5 pb-5 sm:px-8">
            <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 rounded-full border border-border bg-background/90 px-5 py-3 shadow-lift backdrop-blur-md">
              <p className="text-sm text-ink-soft">You have unsaved changes.</p>
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => router.refresh()} className="text-sm text-ink-soft hover:text-foreground">Discard</button>
                <button type="button" onClick={() => void saveAll()} disabled={saving} className="inline-flex items-center gap-2 rounded-full bg-coral px-4 py-2 text-sm text-background transition-opacity hover:opacity-90 disabled:opacity-60">
                  {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Save changes
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {saved && (
          <motion.div
            initial={reduce ? false : { y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={reduce ? undefined : { opacity: 0 }}
            transition={reduce ? { duration: 0 } : { duration: 0.3 }}
            onAnimationComplete={() => setTimeout(() => setSaved(false), 1600)}
            className="fixed inset-x-0 bottom-6 z-40 flex justify-center"
          >
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-background/90 px-4 py-2 text-sm shadow-soft backdrop-blur-md">
              <Check className="h-4 w-4 text-coral" /> Saved
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
