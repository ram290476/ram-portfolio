export async function verifyTurnstile(
  secret: string | undefined,
  token: string | undefined,
  remoteIp: string | null,
  fetchImpl: typeof fetch = fetch
): Promise<boolean> {
  if (!secret || !token) return false;
  const body = new URLSearchParams();
  body.set("secret", secret);
  body.set("response", token);
  if (remoteIp) body.set("remoteip", remoteIp);
  const response = await fetchImpl("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body
  });
  if (!response.ok) return false;
  const payload = await response.json() as { success?: boolean };
  return payload.success === true;
}
