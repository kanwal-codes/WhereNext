import Link from "next/link";

export default function HomePage() {
  return <main><div className="card"><p>Next Place to Be</p><h1>Plan a trip you can actually understand.</h1><p>Start with a destination, then shape the trip with conversation, places, maps, and an editable plan.</p><p><Link href="/trips/new">Create a trip</Link></p><p><Link href="/sign-in">Sign in</Link> · <Link href="/sign-up">Create an account</Link></p></div></main>;
}
