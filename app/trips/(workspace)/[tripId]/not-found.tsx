import Link from "next/link";
import { StatusScreen } from "@/components/StatusScreen";

export const metadata = { title: "Trip not available" };

export default function TripNotFound() {
  return (
    <StatusScreen
      mark="error"
      eyebrow="Trip not available"
      title="This trip is gone."
      actions={<Link href="/trips" className="btn-primary">Back to your trips</Link>}
    >
      It may have been deleted by its owner (a deleted trip is removed for everyone on it), or you are no longer a member.
    </StatusScreen>
  );
}
