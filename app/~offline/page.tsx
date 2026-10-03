import Link from "next/link";
import { StatusScreen } from "@/components/StatusScreen";

export const metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <StatusScreen
      mark="idle"
      eyebrow="Offline"
      title="You’re off the grid."
      actions={<Link href="/trips" className="btn-primary">Back to your trips</Link>}
    >
      This page isn’t saved for offline use. Your current trip’s “Today” view still works without a connection.
    </StatusScreen>
  );
}
