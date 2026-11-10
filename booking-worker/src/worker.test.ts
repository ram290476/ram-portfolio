import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "./index";
import { MicrosoftGraphProvider } from "./providers/microsoft";
import type { Env, KvStore } from "./types";

class MemoryKv implements KvStore {
  private values = new Map<string, string>();
  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }
  async put(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }
}

const NOW = "2026-06-16T06:40:00Z";
const OPEN = { start: "2026-06-16T16:00:00Z", end: "2026-06-16T16:30:00Z" };
const SAME_DAY = { start: "2026-06-15T16:00:00Z", end: "2026-06-15T16:30:00Z" };

function testEnv(overrides: Partial<Env> = {}): Env {
  return {
    CALENDAR_PROVIDER: "microsoft",
    MS_CLIENT_ID: "00000000-0000-0000-0000-000000000000",
    MS_CLIENT_SECRET: "placeholder-not-a-real-secret",
    MS_REFRESH_TOKEN: "placeholder-not-a-real-refresh-token",
    MS_TENANT: "consumers",
    TURNSTILE_SECRET: "placeholder-not-a-real-turnstile-secret",
    CORS_ORIGINS: "https://ram.vellamsetti.com",
    MAIL_CONFIRMATION: "false",
    RATE_LIMIT_MAX: "8",
    RATE_LIMIT_WINDOW_SECONDS: "3600",
    ALLOW_TEST_NOW: "true",
    SLOT_MINUTES: "30",
    BUFFER_MINUTES: "15",
    WORK_START: "09:00",
    WORK_END: "17:00",
    WORK_DAYS: "1,2,3,4,5",
    OWNER_TZ: "America/Los_Angeles",
    HORIZON_DAYS: "14",
    RATE_LIMIT: new MemoryKv(),
    ...overrides
  };
}

interface GraphEvent {
  subject?: string;
  showAs?: string;
  isCancelled?: boolean;
  start: { dateTime: string };
  end: { dateTime: string };
}

function installFetch(options: { events?: GraphEvent[]; turnstile?: boolean; pages?: boolean } = {}) {
  const calls: { url: string; body: string }[] = [];
  const events = options.events ?? [];
  vi.stubGlobal("fetch", async (url: string | URL, init?: RequestInit) => {
    const href = String(url);
    const body = typeof init?.body === "string"
      ? init.body
      : init?.body instanceof URLSearchParams
        ? init.body.toString()
        : "";
    calls.push({ url: href, body });
    if (href.includes("siteverify")) {
      return Response.json({ success: options.turnstile !== false });
    }
    if (href.includes("/oauth2/v2.0/token")) {
      return Response.json({ access_token: "placeholder-access", expires_in: 3600 });
    }
    if (href.includes("calendarView")) {
      if (options.pages && !href.includes("page=2")) {
        return Response.json({
          value: [events[0]].filter(Boolean),
          "@odata.nextLink": "https://graph.microsoft.com/v1.0/me/calendarView?page=2"
        });
      }
      const value = options.pages ? events.slice(1) : events;
      return Response.json({ value });
    }
    if (href.endsWith("/me/events") || href.includes("/me/events?")) {
      return Response.json({ id: "event-1" });
    }
    if (href.includes("/me/contacts")) return Response.json({ id: "contact-1" });
    if (href.includes("/me/sendMail")) return new Response(null, { status: 202 });
    return new Response("missing", { status: 404 });
  });
  return calls;
}

function book(env: Env, slot: { start: string; end: string }, fields: Record<string, string> = {}, now = NOW) {
  return worker.fetch(new Request("https://book.example/book", {
    method: "POST",
    headers: {
      origin: "https://ram.vellamsetti.com",
      "content-type": "application/json",
      "x-test-now": now,
      "cf-connecting-ip": "203.0.113.10"
    },
    body: JSON.stringify({
      slotStart: slot.start,
      slotEnd: slot.end,
      name: "Ada Lovelace",
      email: "ada@example.com",
      turnstileToken: "widget-token",
      visitorTz: "Pacific/Auckland",
      ...fields
    })
  }), env);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("booking routes", () => {
  it("returns policy on /config, including the slot length the page displays", async () => {
    const response = await worker.fetch(new Request("https://book.example/config"), testEnv({ SLOT_MINUTES: "45" }));
    expect(response.status).toBe(200);
    const body = await response.json() as { slotMinutes: number; timezone: string };
    expect(body.slotMinutes).toBe(45);
    expect(body.timezone).toBe("America/Los_Angeles");
  });

  it("offers only open slots and never busy event details", async () => {
    installFetch({
      pages: true,
      events: [
        { subject: "Dentist", showAs: "busy", start: { dateTime: "2026-06-16T16:00:00.0000000" }, end: { dateTime: "2026-06-16T16:30:00.0000000" } },
        { subject: "Focus time", showAs: "free", start: { dateTime: "2026-06-16T17:00:00.0000000" }, end: { dateTime: "2026-06-16T17:30:00.0000000" } },
        { subject: "Cancelled lunch", isCancelled: true, start: { dateTime: "2026-06-16T18:00:00.0000000" }, end: { dateTime: "2026-06-16T18:30:00.0000000" } }
      ]
    });
    const response = await worker.fetch(new Request("https://book.example/slots", {
      headers: { "x-test-now": NOW, "cf-connecting-ip": "203.0.113.8" }
    }), testEnv());
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).not.toContain("Dentist");
    expect(text).not.toContain("Focus time");
    expect(text).not.toContain("subject");
    const body = JSON.parse(text) as { slots: { start: string }[] };
    expect(body.slots.some((slot) => slot.start === "2026-06-16T16:00:00Z")).toBe(false);
    expect(body.slots[0].start).toBe("2026-06-16T17:00:00Z");
  });

  it("rejects a same-day book on /book before it creates an event", async () => {
    const calls = installFetch();
    const response = await book(testEnv(), SAME_DAY);
    expect(response.status).toBe(400);
    expect(calls.some((call) => call.url.includes("login.microsoftonline.com"))).toBe(false);
    expect(calls.some((call) => call.url.includes("/me/events"))).toBe(false);
  });

  it("rejects a visitor-local tomorrow that is still today in Los Angeles", async () => {
    const calls = installFetch();
    const response = await book(testEnv(), SAME_DAY, {}, "2026-06-16T02:00:00Z");
    expect(response.status).toBe(400);
    expect(calls.some((call) => call.url.includes("/me/events"))).toBe(false);
  });

  it("rejects a forged slot that starts at the current instant", async () => {
    const calls = installFetch();
    const response = await book(testEnv(), {
      start: NOW,
      end: "2026-06-16T07:10:00Z"
    });
    expect(response.status).toBe(400);
    expect(calls.some((call) => call.url.includes("/me/calendarView"))).toBe(false);
  });

  it("rechecks busy state and returns 409 without creating a second event", async () => {
    const calls = installFetch({
      events: [{
        subject: "Already booked",
        showAs: "busy",
        start: { dateTime: "2026-06-16T16:00:00Z" },
        end: { dateTime: "2026-06-16T16:30:00Z" }
      }]
    });
    const response = await book(testEnv(), OPEN);
    expect(response.status).toBe(409);
    expect(calls.some((call) => call.url.includes("/me/events") && !call.url.includes("calendarView"))).toBe(false);
  });

  it("creates the event with the visitor as an attendee, then the contact", async () => {
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((line) => { logs.push(String(line)); });
    const calls = installFetch();
    const response = await book(testEnv({ MAIL_CONFIRMATION: "true" }), OPEN, { phone: "+15555550100" });
    expect(response.status).toBe(200);
    const created = calls.find((call) => call.url.endsWith("/me/events"));
    const payload = JSON.parse(created?.body || "{}") as { attendees: { emailAddress: { address: string }, type: string }[] };
    expect(payload.attendees).toEqual([{
      emailAddress: { address: "ada@example.com", name: "Ada Lovelace" },
      type: "required"
    }]);
    const contact = calls.find((call) => call.url.includes("/me/contacts"));
    expect(contact?.body).toContain("ada@example.com");
    expect(contact?.body).toContain("+15555550100");
    expect(calls.some((call) => call.url.includes("/me/sendMail"))).toBe(true);
    expect(calls.some((call) => call.url.includes("getSchedule"))).toBe(false);
    const written = logs.join("\n");
    expect(written).not.toContain("ada@example.com");
    expect(written).not.toContain("+15555550100");
    expect(written).not.toContain("placeholder-not-a-real-refresh-token");
    expect(written).not.toContain("placeholder-access");
  });

  it("accepts a phone number without an email and does not add an attendee", async () => {
    const calls = installFetch();
    const response = await book(testEnv(), OPEN, { email: "", phone: "+15555550100" });
    expect(response.status).toBe(200);
    const created = JSON.parse(calls.find((call) => call.url.endsWith("/me/events"))?.body || "{}") as { attendees: unknown[] };
    expect(created.attendees).toEqual([]);
    expect(calls.some((call) => call.url.includes("/me/sendMail"))).toBe(false);
  });

  it("requires a name and at least one of email or phone", async () => {
    installFetch();
    const missing = await book(testEnv(), OPEN, { email: "", phone: "", name: "" });
    expect(missing.status).toBe(400);
    const neither = await book(testEnv(), OPEN, { email: "", phone: "" });
    expect(neither.status).toBe(400);
  });

  it("stops when Turnstile fails, before any calendar call", async () => {
    const calls = installFetch({ turnstile: false });
    const response = await book(testEnv(), OPEN);
    expect(response.status).toBe(403);
    expect(calls.some((call) => call.url.includes("login.microsoftonline.com"))).toBe(false);
  });

  it("rate limits repeat bookings", async () => {
    installFetch();
    const env = testEnv({ RATE_LIMIT_MAX: "1" });
    expect((await book(env, OPEN)).status).toBe(200);
    const second = await book(env, { start: "2026-06-16T17:00:00Z", end: "2026-06-16T17:30:00Z" });
    expect(second.status).toBe(429);
  });

  it("ignores a frozen clock unless the test flag is on", async () => {
    installFetch();
    const env = testEnv({ ALLOW_TEST_NOW: "false" });
    const response = await book(env, { start: "2020-01-06T17:00:00Z", end: "2020-01-06T17:30:00Z" }, {}, "2020-01-01T00:00:00Z");
    expect(response.status).toBe(400);
  });

  it("does not log a raw address from the provider", async () => {
    const fetchImpl = (async (url: string | URL) => {
      if (String(url).includes("/token")) {
        return Response.json({ access_token: "placeholder-access", expires_in: 3600 });
      }
      return Response.json({
        value: [{
          subject: "Private title",
          location: { displayName: "north building" },
          showAs: "busy",
          start: { dateTime: "2026-06-16T16:00:00Z" },
          end: { dateTime: "2026-06-16T16:30:00Z" }
        }]
      });
    }) as typeof fetch;
    const busy = await new MicrosoftGraphProvider(testEnv(), fetchImpl).getBusy({
      start: "2026-06-16T00:00:00Z",
      end: "2026-06-20T00:00:00Z"
    });
    expect(JSON.stringify(busy)).not.toContain("Private title");
    expect(JSON.stringify(busy)).not.toContain("north building");
    expect(busy).toEqual([{ start: "2026-06-16T16:00:00Z", end: "2026-06-16T16:30:00Z" }]);
  });
});
