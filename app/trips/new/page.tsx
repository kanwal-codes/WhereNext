import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NewTripForm } from "@/features/trip-setup/ui/NewTripForm";
import { Reveal } from "@/components/motion-primitives";

export const metadata = {
  title: "Create a trip — Where next?",
  description: "Start with a conversation. Your trip takes shape as you talk.",
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
      <div className="mx-auto max-w-2xl px-5 py-10 sm:px-8 lg:py-16">
        <Link href="/trips" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> All trips
        </Link>

        <Reveal>
          <p className="eyebrow mt-8">New trip</p>
          <h1 className="mt-3 max-w-lg font-display text-4xl leading-[1.15]">
            Start with a feeling. We&rsquo;ll find the trip.
          </h1>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
            No form to finish first. Tell Roam what&rsquo;s on your mind and shape the details when
            you&rsquo;re ready.
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
    </div>
  );
}
