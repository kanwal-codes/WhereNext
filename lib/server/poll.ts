import type { SupabaseClient } from "@supabase/supabase-js";
import type { Poll } from "@/packages/contracts/poll";

type PollRow = { id: string; question: string; options: Array<{ key: string; label: string }>; created_by: string | null };

/** One or more polls, with live vote tallies resolved for `viewerId` — shared by the create-poll
 *  route (the freshly-created poll starts at zero votes) and the group-chat message list (a
 *  poll's card needs current tallies every time messages are (re)fetched, not just at creation). */
export async function resolvePolls(supabase: SupabaseClient, pollIds: string[], viewerId: string): Promise<Map<string, Poll>> {
  const map = new Map<string, Poll>();
  if (pollIds.length === 0) return map;

  const [pollsRes, votesRes] = await Promise.all([
    supabase.from("trip_polls").select("id,question,options,created_by").in("id", pollIds),
    supabase.from("trip_poll_votes").select("poll_id,user_id,option_key").in("poll_id", pollIds),
  ]);
  if (pollsRes.error) throw pollsRes.error;
  if (votesRes.error) throw votesRes.error;

  const votesByPoll = new Map<string, Array<{ user_id: string; option_key: string }>>();
  for (const vote of (votesRes.data ?? []) as Array<{ poll_id: string; user_id: string; option_key: string }>) {
    const list = votesByPoll.get(vote.poll_id) ?? [];
    list.push(vote);
    votesByPoll.set(vote.poll_id, list);
  }

  for (const poll of (pollsRes.data ?? []) as PollRow[]) {
    const votes = votesByPoll.get(poll.id) ?? [];
    const options = poll.options.map((option) => ({
      key: option.key,
      label: option.label,
      count: votes.filter((v) => v.option_key === option.key).length,
      mine: votes.some((v) => v.user_id === viewerId && v.option_key === option.key),
    }));
    map.set(poll.id, { id: poll.id, question: poll.question, options, totalVotes: votes.length, createdBy: poll.created_by });
  }
  return map;
}
