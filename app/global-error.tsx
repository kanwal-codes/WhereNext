"use client";

import { useEffect } from "react";

/**
 * Catches a crash in the root layout itself (where app/error.tsx can't run, since it
 * renders inside that same layout). Must render its own <html>/<body> — there is no
 * outer layout left standing to supply them.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main style={{ maxWidth: 380, margin: "0 auto", padding: "80px 20px", textAlign: "center", fontFamily: "system-ui, sans-serif", color: "#1b1611" }}>
          <h1 style={{ fontSize: 22, fontWeight: 600 }}>Something went wrong</h1>
          <p style={{ marginTop: 8, fontSize: 14, color: "#68625c" }}>The page hit an unexpected error. Try reloading.</p>
          <button
            onClick={reset}
            style={{ marginTop: 24, borderRadius: 999, background: "#1b1611", color: "#fff", padding: "10px 20px", fontSize: 14, fontWeight: 500, border: "none", cursor: "pointer" }}
          >
            Reload
          </button>
        </main>
      </body>
    </html>
  );
}
