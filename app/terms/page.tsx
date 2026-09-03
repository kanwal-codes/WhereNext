import type { Metadata } from "next";
import { LegalDocument, LegalSection } from "@/components/LegalDocument";

export const metadata: Metadata = {
  title: "Terms of Service — Where Next",
  description: "Terms for using Where Next to plan trips.",
};

export default function TermsPage() {
  return (
    <LegalDocument title="Terms of Service" updated="3 September 2026">
      <p>
        These terms govern use of Where Next at{" "}
        <a href="https://www.wherenexts.com">https://www.wherenexts.com</a>. By creating an
        account or using the product, you agree to them.
      </p>

      <LegalSection heading="The service">
        <p>
          Where Next is a trip-planning workspace. You can sign in, talk through a trip, and
          organise places, stays, routes, and related notes. Recommendations come from our
          assistant and third-party sources. They are informational — not a booking contract,
          visa advice, or a guarantee of availability, price, or safety.
        </p>
      </LegalSection>

      <LegalSection heading="Your account">
        <p>
          You must provide accurate information and keep your login safe. You are responsible
          for activity under your account. If you sign in with Google, you also follow Google’s
          terms for that sign-in.
        </p>
      </LegalSection>

      <LegalSection heading="Acceptable use">
        <p>
          Do not misuse the service: no scraping at scale, no attempts to break security, no
          unlawful content, and no use that overloads or disrupts the product or its providers.
        </p>
      </LegalSection>

      <LegalSection heading="Content you create">
        <p>
          You keep rights to the trip notes and messages you enter. You grant us a licence to
          host, process, and display that content so the product can work (including sending
          relevant snippets to AI and data providers to answer your questions).
        </p>
      </LegalSection>

      <LegalSection heading="Third-party services">
        <p>
          Maps, places, events, and sign-in may depend on Google, Supabase, and other vendors.
          Their availability and terms are outside our control. Links to hotels, tickets, or
          other operators are provided for convenience; your contract is with them.
        </p>
      </LegalSection>

      <LegalSection heading="Availability">
        <p>
          We provide the service “as is.” Features may change or go down. We are not liable for
          missed bookings, travel disruption, or decisions you make based on recommendations.
        </p>
      </LegalSection>

      <LegalSection heading="Limitation of liability">
        <p>
          To the fullest extent allowed by law, Where Next and its operator are not liable for
          indirect, incidental, or consequential damages, or for lost profits or data, arising
          from use of the service.
        </p>
      </LegalSection>

      <LegalSection heading="Termination">
        <p>
          You may stop using the product at any time. We may suspend or close accounts that
          violate these terms or harm the service.
        </p>
      </LegalSection>

      <LegalSection heading="Changes">
        <p>
          We may update these terms. The “Last updated” date will change when we do. Continued
          use after an update means you accept the new terms.
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
