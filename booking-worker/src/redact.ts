export async function fingerprint(value: string): Promise<string> {
  const data = new TextEncoder().encode(value.trim().toLowerCase());
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].slice(0, 6).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function logEvent(event: string, fields: Record<string, string | number | boolean | null>): void {
  console.log(JSON.stringify({ event, ...fields }));
}

/** Drop anything that could carry an address, a token, or a raw contact. */
export function publicError(err: unknown): string {
  const raw = err instanceof Error ? err.message : "";
  if (!raw || /@|token|secret|bearer|authorization/i.test(raw)) return "Booking is temporarily unavailable.";
  return raw.slice(0, 160);
}
