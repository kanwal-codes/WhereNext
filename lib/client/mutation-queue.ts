"use client";

import { openDB, type IDBPDatabase } from "idb";
import { notifyToast } from "@/lib/application/toast";
import { announceWorkspaceChange, type WorkspaceChange } from "@/lib/application/workspace-events";

/**
 * Offline write queue. A `mutate()` call tries the network; if that fails
 * because we're offline it stores the request and reports success optimistically.
 * On reconnect the queue replays FIFO. Scope is deliberately small — only
 * state-setting endpoints that are safe to replay last-write-wins (place
 * placement, itinerary reorder). No merge.
 */

const DB_NAME = "wn-mutations";
const STORE = "queue";

type QueuedMutation = { id?: number; url: string; method: string; body: string; announce: WorkspaceChange[]; enqueuedAt: number };

let dbPromise: Promise<IDBPDatabase> | null = null;
function db(): Promise<IDBPDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("no IndexedDB"));
  dbPromise ??= openDB(DB_NAME, 1, {
    upgrade(database) {
      if (!database.objectStoreNames.contains(STORE)) database.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
    },
  });
  return dbPromise;
}

async function enqueue(m: Omit<QueuedMutation, "id">): Promise<void> {
  await (await db()).add(STORE, m);
}

function isOfflineError(err: unknown): boolean {
  return err instanceof TypeError || (typeof navigator !== "undefined" && !navigator.onLine);
}

export type MutateResult = { ok: boolean; queued: boolean; status: number };

/**
 * Send a mutation. If offline, queue it and return `{ ok: true, queued: true }`
 * so the caller's optimistic UI stands. `announce` events fire on success and
 * again after a successful replay.
 */
export async function mutate(url: string, init: { method: string; body: unknown; announce?: WorkspaceChange[] }): Promise<MutateResult> {
  const body = JSON.stringify(init.body);
  const announce = init.announce ?? [];
  try {
    const res = await fetch(url, { method: init.method, headers: { "content-type": "application/json" }, body });
    if (!res.ok) return { ok: false, queued: false, status: res.status };
    for (const a of announce) announceWorkspaceChange(a);
    return { ok: true, queued: false, status: res.status };
  } catch (err) {
    if (!isOfflineError(err)) return { ok: false, queued: false, status: 0 };
    await enqueue({ url, method: init.method, body, announce, enqueuedAt: Date.now() });
    return { ok: true, queued: true, status: 0 };
  }
}

let flushing = false;

/** Replay every queued mutation in order. Stops on the first network error (still offline). */
async function flushMutations(): Promise<void> {
  if (flushing || (typeof navigator !== "undefined" && !navigator.onLine)) return;
  flushing = true;
  try {
    const database = await db();
    const rows = (await database.getAll(STORE)) as QueuedMutation[];
    let synced = 0;
    let dropped = 0;
    for (const row of rows.sort((a, b) => (a.id ?? 0) - (b.id ?? 0))) {
      try {
        const res = await fetch(row.url, { method: row.method, headers: { "content-type": "application/json" }, body: row.body });
        if (res.ok) {
          await database.delete(STORE, row.id!);
          for (const a of row.announce) announceWorkspaceChange(a);
          synced += 1;
        } else if (res.status >= 400 && res.status < 500) {
          await database.delete(STORE, row.id!); // the world moved on — drop it
          dropped += 1;
        } else {
          break; // 5xx — try again later
        }
      } catch {
        break; // network gone again
      }
    }
    if (synced) notifyToast(`Synced ${synced} change${synced === 1 ? "" : "s"} made offline.`, "success");
    if (dropped) notifyToast(`${dropped} offline change${dropped === 1 ? "" : "s"} no longer applied.`, "info");
  } finally {
    flushing = false;
  }
}

let wired = false;
/** Call once (client) to replay the queue on reconnect. */
export function initMutationQueue(): void {
  if (wired || typeof window === "undefined") return;
  wired = true;
  window.addEventListener("online", () => void flushMutations());
  if (navigator.onLine) void flushMutations();
}
