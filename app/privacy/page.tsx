import type { Metadata } from "next";
import { LegalDocument, LegalSection } from "@/components/LegalDocument";

export const metadata: Metadata = {
  title: "Privacy Policy — Where Next",
  description: "How Where Next collects, uses, and shares information when you plan trips with us.",
};

export default function PrivacyPage() {
  return (
    <LegalDocument title="Privacy Policy" updated="3 September 2026">
      <p>
        Where Next (“we”, “us”) is a trip-planning product at{" "}
        <a href="https://www.wherenexts.com">https://www.wherenexts.com</a>. This policy
        explains what we collect when you use the site, including Sign in with Google.
      </p>

      <LegalSection heading="Who this applies to">
        <p>
          Anyone who visits the site, creates an account, signs in with email or Google, or
          uses trip, chat, map, or booking tools in the product.
        </p>
      </LegalSection>

      <LegalSection heading="Information we collect">
        <p>
          <strong className="text-foreground">Account.</strong> Email address, display name, and
          a password hash if you sign up with email. If you use Google, we receive the
          identifiers Google provides for sign-in (typically your Google account email, name,
          and profile photo) via our authentication provider, Supabase.
        </p>
        <p>
          <strong className="text-foreground">Trip content you enter.</strong> Destinations,
          dates, messages to the assistant, saved places, itineraries, budgets, and similar
          planning data you create in the app.
        </p>
        <p>
          <strong className="text-foreground">Technical.</strong> Session cookies needed to keep
          you signed in, approximate device and browser information, and standard server logs
          (IP address, timestamps, error reports) used to operate and debug the service.
        </p>
      </LegalSection>

      <LegalSection heading="How we use it">
        <p>
          To authenticate you, restore your trips, generate and retrieve recommendations, show
          maps and nearby places, improve reliability, and contact you about your account when
          needed. We do not sell your personal information.
        </p>
      </LegalSection>

      <LegalSection heading="Who we share it with">
        <p>
          Processors that run the product on our behalf: hosting (Vercel), authentication and
          database (Supabase), Google (sign-in if you choose it, and Maps/Places features),
          and other travel or event data sources the assistant queries when you ask for
          recommendations. Those providers process data under their own terms.
        </p>
        <p>
          We may disclose information if required by law or to protect the service and its
          users.
        </p>
      </LegalSection>

      <LegalSection heading="Cookies and sessions">
        <p>
          We use essential cookies and similar storage to keep your session after you sign in.
          We do not use them to run third-party advertising on Where Next.
        </p>
      </LegalSection>

      <LegalSection heading="Retention">
        <p>
          We keep account and trip data while your account is active. You can ask us to delete
          your account and associated planning data by emailing the address below. Backup
          copies may persist for a short period after deletion.
        </p>
      </LegalSection>

      <LegalSection heading="Your choices">
        <p>
          You can use email sign-in instead of Google. You can request access, correction, or
          deletion of personal data we hold. If you signed in with Google, you can also revoke
          Where Next’s access in your Google account permissions.
        </p>
      </LegalSection>

      <LegalSection heading="Children">
        <p>Where Next is not directed at children under 13, and we do not knowingly collect their data.</p>
      </LegalSection>

      <LegalSection heading="Changes">
        <p>
          We may update this policy. The “Last updated” date above will change when we do. Continued
          use of the site after an update means you accept the revised policy.
        </p>
      </LegalSection>

      <LegalSection heading="Contact">
        <p>
          Where Next —{" "}
          <a href="mailto:kanwal.codes17@gmail.com">kanwal.codes17@gmail.com</a>
        </p>
      </LegalSection>
    </LegalDocument>
  );
}
