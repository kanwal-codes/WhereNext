import Link from "next/link";

export const metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-sm flex-col items-center justify-center px-5 text-center">
      <h1 className="font-display text-2xl">You’re offline</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        This page isn’t saved for offline use. Your current trip’s “Today” view still works without a connection.
      </p>
      <Link href="/trips" className="link-underline mt-6 text-sm font-medium">Back to your trips</Link>
    </main>
  );
}
