import { redirect } from "next/navigation";

// The email-entry step now lives at /forgot-password (AuthShell design).
export default function ResetPasswordPage() {
  redirect("/forgot-password");
}
