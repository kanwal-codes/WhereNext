type Entry<T> = { expiresAt: number; value: Promise<T> };
const entries = new Map<string, Entry<unknown>>();
const maxEntries = 256;

export function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const current = entries.get(key) as Entry<T> | undefined;
  if (current && current.expiresAt > Date.now()) return current.value;
  if (current) entries.delete(key);
  while (entries.size >= maxEntries) entries.delete(entries.keys().next().value as string);
  const value = load().catch((error) => { entries.delete(key); throw error; });
  entries.set(key, { expiresAt: Date.now() + ttlMs, value });
  return value;
}
