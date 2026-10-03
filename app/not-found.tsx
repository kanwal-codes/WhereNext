import Link from "next/link";
import { StatusScreen } from "@/components/StatusScreen";

export const metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <StatusScreen
      mark="error"
      eyebrow="404"
      title="This page took a wrong turn."
      actions={
        <>
          <Link href="/trips" className="btn-primary">Back to your trips</Link>
          <Link href="/" className="btn-secondary">Home</Link>
        </>
      }
    >
      The link may be old, or the page may have moved. Your trips are right where you left them.
    </StatusScreen>
  );
}
