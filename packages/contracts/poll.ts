import { z } from "zod";

/** Single-choice only for v1 — no ranked-choice, no anonymous mode. Matches how light-touch
 *  trip_date_availability is: enough to settle a decision, not a full voting system. */
export const createPollInput = z.object({
  question: z.string().trim().min(1).max(200),
  options: z.array(z.string().trim().min(1).max(80)).min(2).max(6),
});

export const castVoteInput = z.object({
  optionKey: z.string().trim().min(1).max(40),
});

type PollOption = { key: string; label: string; count: number; mine: boolean };

export type Poll = {
  id: string;
  question: string;
  options: PollOption[];
  totalVotes: number;
  createdBy: string | null;
};
