import type { KvStore } from "./types";

/** Returns true when the caller is still under the limit. Fail closed if KV is missing. */
export async function allow(kv: KvStore | undefined, keys: string[], max: number, windowSeconds: number): Promise<boolean> {
  if (!kv) return false;
  const counts: number[] = [];
  for (const key of keys) {
    const current = Number((await kv.get(key)) || "0");
    if (!Number.isFinite(current)) return false;
    if (current >= max) return false;
    counts.push(current);
  }
  for (let i = 0; i < keys.length; i += 1) {
    await kv.put(keys[i], String(counts[i] + 1), { expirationTtl: windowSeconds });
  }
  return true;
}
