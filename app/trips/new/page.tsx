import Link from "next/link";
import { ArrowLeft, MessageCircle } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NewTripForm } from "@/features/trip-setup/ui/NewTripForm";
import { Reveal } from "@/components/motion-primitives";

export const metadata = {
  title: "Create a trip — Next Place to Be",
  description: "Start with a trip name and a destination. Everything else comes out of the conversation.",
};

export default async function NewTripPage() {
  let authenticated = false;
  try {
    const { data: { user } } = await (await createSupabaseServerClient()).auth.getUser();
    authenticated = Boolean(user);
  } catch {
    /* show the auth prompt when auth is unavailable */
  }

  return (
    <div className="min-h-screen">
      <div className="mx-auto grid max-w-5xl gap-10 px-5 py-10 sm:px-8 lg:grid-cols-[minmax(0,1fr)_300px] lg:py-16">
        <div>
          <Link href="/trips" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> All trips
          </Link>

          <Reveal>
            <p className="eyebrow mt-8">New trip</p>
            <h1 className="mt-3 max-w-lg font-display text-4xl leading-[1.15]">
              A few things to start. The rest is a conversation.
            </h1>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
              Only a name and a destination are required. Everything you add here just gives the
              assistant a head start.
            </p>
          </Reveal>

          <Reveal delay={0.12}>
            <div className="mt-9">
              {authenticated ? (
                <NewTripForm />
              ) : (
                <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
                  <p className="text-sm">Sign in or create an account before starting a trip.</p>
                  <p className="mt-3 text-sm">
                    <Link href="/sign-in" className="font-medium text-primary">Sign in</Link>
                    {" · "}
                    <Link href="/sign-up" className="font-medium text-primary">Create an account</Link>
                  </p>
                </div>
              )}
            </div>
          </Reveal>
        </div>

        <Reveal delay={0.2}>
          <aside className="rounded-2xl border border-border bg-card p-5 shadow-soft lg:sticky lg:top-10">
            <MessageCircle className="h-5 w-5 text-primary" />
            <h2 className="mt-3 font-display text-lg leading-snug">What happens next</h2>
            <ol className="mt-4 space-y-4 text-sm leading-relaxed text-ink-soft">
              {[
                "The assistant asks one open question, not a questionnaire.",
                "You answer however you like — or skip it.",
                "Details you confirm show up in the trip knowledge.",
                "When something's easier to see, a visual view opens beside the chat.",
              ].map((step, i) => (
                <li key={step} className="flex gap-3">
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-coral-soft text-[11px] font-medium text-coral">
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </aside>
        </Reveal>
      </div>
    </div>
  );
}
