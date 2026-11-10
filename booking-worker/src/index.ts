import { allow } from "./ratelimit";
import { fingerprint, logEvent, publicError } from "./redact";
import { evaluateSlot, generateSlots, loadPolicy, nextOwnerMidnight, toUtcIso, type SlotDecision } from "./policy";
import { createProvider } from "./providers/factory";
import { verifyTurnstile } from "./turnstile";
import type { Attendee, Env, Slot } from "./types";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface BookBody {
  slotStart?: unknown;
  slotEnd?: unknown;
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  turnstileToken?: unknown;
  visitorTz?: unknown;
}

function routeOf(pathname: string): string {
  if (pathname === "/api/slots" || pathname === "/slots") return "slots";
  if (pathname === "/api/book" || pathname === "/book") return "book";
  if (pathname === "/api/config" || pathname === "/config") return "config";
  if (pathname === "/health") return "health";
  return "";
}

function corsOrigin(request: Request, env: Env): string | null {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  const allowed = (env.CORS_ORIGINS || "https://ram.vellamsetti.com").split(",").map((item) => item.trim());
  return allowed.includes(origin) ? origin : "";
}

function json(request: Request, env: Env, status: number, body: unknown): Response {
  const headers = new Headers({
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    vary: "Origin"
  });
  const origin = corsOrigin(request, env);
  if (origin) {
    headers.set("access-control-allow-origin", origin);
  }
  return new Response(JSON.stringify(body), { status, headers });
}

function requestNow(request: Request, env: Env): Date {
  if (env.ALLOW_TEST_NOW === "true") {
    const raw = request.headers.get("x-test-now");
    if (raw) {
      const date = new Date(raw);
      if (!Number.isNaN(date.getTime())) return date;
    }
  }
  return new Date();
}

function clientIp(request: Request): string {
  return request.headers.get("cf-connecting-ip")
    || request.headers.get("x-forwarded-for")?.split(",")[0].trim()
    || "unknown";
}

function cleanText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f]/g, "").trim().slice(0, max);
}

function normalizePhone(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\+?[0-9().\-\s]+$/.test(trimmed)) return null;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  return (trimmed.startsWith("+") ? "+" : "") + digits;
}

function attendeeFrom(body: BookBody): { attendee?: Attendee; error?: string } {
  const name = cleanText(body.name, 100);
  if (name.length < 1) return { error: "Add your name." };
  const emailRaw = cleanText(body.email, 200);
  const phoneRaw = cleanText(body.phone, 24);
  if (!emailRaw && !phoneRaw) return { error: "Add an email or a phone number." };
  let email: string | undefined;
  let phone: string | undefined;
  if (emailRaw) {
    if (!EMAIL.test(emailRaw) || emailRaw.length > 200) return { error: "That email does not look valid." };
    email = emailRaw;
  }
  if (phoneRaw) {
    const normalized = normalizePhone(phoneRaw);
    if (!normalized) return { error: "That phone number does not look valid." };
    phone = normalized;
  }
  return { attendee: { name, email, phone } };
}

function decisionResponse(request: Request, env: Env, decision: SlotDecision): Response | null {
  if (decision.ok) return null;
  return json(request, env, decision.status || 400, { error: decision.error || "That time is not available." });
}

async function readJson(request: Request): Promise<BookBody | null> {
  const declared = Number(request.headers.get("content-length") || "0");
  if (declared > 10_000) return null;
  const text = await request.text();
  if (text.length > 10_000) return null;
  try {
    return JSON.parse(text) as BookBody;
  } catch {
    return null;
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = corsOrigin(request, env);
    if (origin === "") return json(request, env, 403, { error: "Origin is not allowed." });
    if (request.method === "OPTIONS") {
      const headers = new Headers({
        vary: "Origin",
        "access-control-allow-methods": "GET, POST, OPTIONS",
        "access-control-allow-headers": "Content-Type, Accept",
        "access-control-max-age": "86400"
      });
      if (origin) headers.set("access-control-allow-origin", origin);
      return new Response(null, { status: 204, headers });
    }

    const route = routeOf(new URL(request.url).pathname);
    if (!route) return json(request, env, 404, { error: "Not found." });
    if (route === "health") return json(request, env, 200, { ok: true });

    let policy;
    try {
      policy = loadPolicy(env);
    } catch {
      return json(request, env, 500, { error: "Booking is temporarily unavailable." });
    }

    if (route === "config" && request.method === "GET") {
      return json(request, env, 200, {
        slotMinutes: policy.slotMinutes,
        bufferMinutes: policy.bufferMinutes,
        workStart: policy.workStart,
        workEnd: policy.workEnd,
        workDays: policy.workDays,
        timezone: policy.ownerTz,
        horizonDays: policy.horizonDays
      });
    }

    if (route === "slots" && request.method === "GET") {
      const ipHash = await fingerprint(clientIp(request));
      const windowSeconds = Number(env.RATE_LIMIT_WINDOW_SECONDS || "3600");
      const max = Number(env.RATE_LIMIT_MAX || "8");
      const allowed = await allow(env.RATE_LIMIT, [`slots:ip:${ipHash}`], Math.max(30, max * 4), windowSeconds);
      if (!allowed) return json(request, env, env.RATE_LIMIT ? 429 : 503, { error: env.RATE_LIMIT ? "Too many requests." : "Booking is not configured." });
      try {
        const now = requestNow(request, env);
        const provider = createProvider(env);
        const windowStart = nextOwnerMidnight(now, policy.ownerTz).minus({ days: 1 });
        const windowEnd = nextOwnerMidnight(now, policy.ownerTz).plus({ days: policy.horizonDays + 1 });
        const busy = await provider.getBusy({ start: toUtcIso(windowStart), end: toUtcIso(windowEnd) });
        const slots = generateSlots(now, policy, busy);
        logEvent("slots", { count: slots.length, ip: ipHash });
        return json(request, env, 200, {
          slotMinutes: policy.slotMinutes,
          timezone: policy.ownerTz,
          slots
        });
      } catch (err) {
        logEvent("slots_failed", { reason: publicError(err) === "Booking is temporarily unavailable." ? "upstream" : "policy" });
        return json(request, env, 503, { error: "Availability is temporarily unavailable." });
      }
    }

    if (route === "book" && request.method === "POST") {
      const body = await readJson(request);
      if (!body) return json(request, env, 400, { error: "The request could not be read." });
      const ip = clientIp(request);
      const turnstileOk = await verifyTurnstile(env.TURNSTILE_SECRET, cleanText(body.turnstileToken, 2048), ip === "unknown" ? null : ip);
      if (!turnstileOk) {
        logEvent("book_rejected", { reason: "turnstile" });
        return json(request, env, 403, { error: "The spam check failed." });
      }
      const parsed = attendeeFrom(body);
      if (!parsed.attendee) return json(request, env, 400, { error: parsed.error || "Check the form and try again." });
      const slot: Slot = {
        start: cleanText(body.slotStart, 40),
        end: cleanText(body.slotEnd, 40)
      };
      const now = requestNow(request, env);
      const early = decisionResponse(request, env, evaluateSlot(now, policy, slot, []));
      if (early) return early;

      const emailHash = parsed.attendee.email ? await fingerprint(parsed.attendee.email) : "";
      const phoneHash = parsed.attendee.phone ? await fingerprint(parsed.attendee.phone) : "";
      try {
        const provider = createProvider(env);
        const busy = await provider.getBusy({
          start: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
          end: new Date(now.getTime() + (policy.horizonDays + 2) * 24 * 60 * 60 * 1000).toISOString()
        });
        const again = decisionResponse(request, env, evaluateSlot(now, policy, slot, busy));
        if (again) return again;

        const windowSeconds = Number(env.RATE_LIMIT_WINDOW_SECONDS || "3600");
        const max = Number(env.RATE_LIMIT_MAX || "8");
        const keys = [`book:ip:${await fingerprint(ip)}`];
        if (emailHash) keys.push(`book:email:${emailHash}`);
        if (phoneHash) keys.push(`book:phone:${phoneHash}`);
        const allowed = await allow(env.RATE_LIMIT, keys, max, windowSeconds);
        if (!allowed) {
          return json(request, env, env.RATE_LIMIT ? 429 : 503, { error: env.RATE_LIMIT ? "Too many requests." : "Booking is not configured." });
        }

        await provider.createEvent(slot, parsed.attendee);
        if (env.MAIL_CONFIRMATION === "true" && parsed.attendee.email && provider.sendConfirmation) {
          try {
            await provider.sendConfirmation(parsed.attendee.email, slot, parsed.attendee);
          } catch {
            logEvent("mail_failed", { email: emailHash });
          }
        }
        try {
          await provider.upsertContact(parsed.attendee);
        } catch {
          logEvent("contact_failed", { email: emailHash, phone: phoneHash });
        }
        logEvent("booked", { email: emailHash, phone: phoneHash, hasEmail: Boolean(parsed.attendee.email) });
        return json(request, env, 200, { ok: true, start: slot.start, end: slot.end });
      } catch (err) {
        logEvent("book_failed", { reason: "upstream", email: emailHash, phone: phoneHash });
        return json(request, env, 500, { error: publicError(err) });
      }
    }

    return json(request, env, 405, { error: "Method not allowed." });
  }
};
