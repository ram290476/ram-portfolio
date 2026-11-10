import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import { evaluateSlot, generateSlots, loadPolicy, nextOwnerMidnight } from "./policy";
import type { PolicyConfig } from "./types";

const cfg: PolicyConfig = loadPolicy({
  SLOT_MINUTES: "30",
  BUFFER_MINUTES: "15",
  WORK_START: "09:00",
  WORK_END: "17:00",
  WORK_DAYS: "1,2,3,4,5",
  OWNER_TZ: "America/Los_Angeles",
  HORIZON_DAYS: "14"
});

function utc(iso: string): number {
  return Date.parse(iso);
}

describe("next Pacific calendar day", () => {
  it("uses the next Los Angeles date across the 2026 spring-forward", () => {
    const beforeJump = nextOwnerMidnight(new Date("2026-03-08T09:30:00Z"), cfg.ownerTz);
    const afterJump = nextOwnerMidnight(new Date("2026-03-08T10:30:00Z"), cfg.ownerTz);
    expect(beforeJump.toUTC().toMillis()).toBe(utc("2026-03-09T07:00:00Z"));
    expect(afterJump.toUTC().toMillis()).toBe(utc("2026-03-09T07:00:00Z"));
    expect(beforeJump.setZone(cfg.ownerTz).toFormat("yyyy-MM-dd HH:mm")).toBe("2026-03-09 00:00");
  });

  it("uses the next Los Angeles date across the 2026 fall-back, both 1:30 hours", () => {
    const first = nextOwnerMidnight(new Date("2026-11-01T08:30:00Z"), cfg.ownerTz);
    const second = nextOwnerMidnight(new Date("2026-11-01T09:30:00Z"), cfg.ownerTz);
    expect(first.toUTC().toMillis()).toBe(utc("2026-11-02T08:00:00Z"));
    expect(second.toUTC().toMillis()).toBe(utc("2026-11-02T08:00:00Z"));
    expect(first.setZone(cfg.ownerTz).toFormat("yyyy-MM-dd HH:mm")).toBe("2026-11-02 00:00");
  });
});

describe("no same-day slots", () => {
  it("hides today at 11:40pm Pacific and offers 9:00am the next morning", () => {
    const now = new Date("2026-06-16T06:40:00Z");
    expect(DateTime.fromJSDate(now, { zone: cfg.ownerTz }).toFormat("yyyy-MM-dd HH:mm")).toBe("2026-06-15 23:40");
    const slots = generateSlots(now, cfg, []);
    expect(slots[0]).toEqual({ start: "2026-06-16T16:00:00Z", end: "2026-06-16T16:30:00Z" });
    expect(slots.some((slot) => slot.start.startsWith("2026-06-15"))).toBe(false);
    const today = evaluateSlot(now, cfg, {
      start: "2026-06-15T16:00:00Z",
      end: "2026-06-15T16:30:00Z"
    }, []);
    expect(today).toMatchObject({ ok: false, status: 400 });
  });

  it("keeps using the Los Angeles date when a UTC+13 visitor is already on the next day", () => {
    const now = new Date("2026-01-15T18:00:00Z");
    const la = DateTime.fromJSDate(now, { zone: cfg.ownerTz });
    const ahead = DateTime.fromJSDate(now, { zone: "Pacific/Auckland" });
    expect(ahead.offset).toBe(13 * 60);
    expect(la.toFormat("yyyy-MM-dd")).toBe("2026-01-15");
    expect(ahead.toFormat("yyyy-MM-dd")).toBe("2026-01-16");
    const slots = generateSlots(now, cfg, []);
    expect(slots[0].start).toBe("2026-01-16T17:00:00Z");
    expect(slots.some((slot) => slot.start.startsWith("2026-01-15"))).toBe(false);
    const forged = evaluateSlot(now, cfg, {
      start: "2026-01-15T17:00:00Z",
      end: "2026-01-15T17:30:00Z"
    }, []);
    expect(forged.status).toBe(400);
  });

  it("rejects a crafted slot that starts now", () => {
    const now = new Date("2026-06-16T06:40:00Z");
    const end = new Date(now.getTime() + 30 * 60 * 1000).toISOString();
    const decision = evaluateSlot(now, cfg, { start: now.toISOString(), end }, []);
    expect(decision.status).toBe(400);
  });

  it("skips the weekend and offers Monday after a Friday night", () => {
    const now = new Date("2026-06-20T06:40:00Z");
    expect(DateTime.fromJSDate(now, { zone: cfg.ownerTz }).weekday).toBe(5);
    const slots = generateSlots(now, cfg, []);
    expect(slots[0].start).toBe("2026-06-22T16:00:00Z");
    expect(DateTime.fromISO(slots[0].start, { zone: "utc" }).setZone(cfg.ownerTz).weekday).toBe(1);
  });

  it("applies the buffer around a busy block", () => {
    const now = new Date("2026-06-16T06:40:00Z");
    const slots = generateSlots(now, cfg, [{
      start: "2026-06-16T16:00:00Z",
      end: "2026-06-16T16:30:00Z"
    }]);
    expect(slots.some((slot) => slot.start === "2026-06-16T16:00:00Z")).toBe(false);
    expect(slots.some((slot) => slot.start === "2026-06-16T16:30:00Z")).toBe(false);
    expect(slots[0].start).toBe("2026-06-16T17:00:00Z");
  });
});
