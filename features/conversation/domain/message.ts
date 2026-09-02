import { z } from "zod";

export const messageInput = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(8000),
  idempotencyKey: z.string().min(1).max(120).optional(),
});
export const userMessageInput = messageInput.extend({ role: z.literal("user") });
export type MessageInput = z.infer<typeof messageInput>;
export type Message = { id: string; role: "user" | "assistant"; content: string; created_at: string; metadata?: Record<string, unknown> };
