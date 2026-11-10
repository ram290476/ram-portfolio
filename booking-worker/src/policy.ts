import { DateTime } from "luxon";
import type { BusyRange, Env, PolicyConfig, Slot } from "./types";

export interface SlotDecision {
  ok: boolean;
  status?: 400 | 409;
  error?: string;
}

function integer(value: string | undefined, fallback: number): number {
  if (value == null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("invalid policy number");
  }
  return parsed;
}

export function loadPolicy(env: Env): PolicyConfig {
  const workDays = (env.WORK_DAYS || "1,2,3,4,5")
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((day) => day >= 1 && day <= 7);
  if (!workDays.length) throw new Error("invalid work days");
  const workStart = env.WORK_START || "09:00";
  const workEnd = env.WORK_END || "17:00";
  parseHm(workStart);
  parseHm(workEnd);
  return {
    slotMinutes: integer(env.SLOT_MINUTES, 30),
    bufferMinutes: integer(env.BUFFER_MINUTES, 15),
    workStart,
    workEnd,
    workDays,
    ownerTz: env.OWNER_TZ || "America/Los_Angeles",
    horizonDays: integer(env.HORIZON_DAYS, 14)
  };
}

export function parseHm(value: string): { hour: number; minute: number } {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error("invalid clock time");
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) throw new Error("invalid clock time");
  return { hour, minute };
}

/** Start of the next calendar day in the owner zone. DST-safe. */
export function nextOwnerMidnight(now: Date, zone: string): DateTime {
  const local = DateTime.fromJSDate(now, { zone });
  if (!local.isValid) throw new Error("invalid instant");
  return local.startOf("day").plus({ days: 1 });
}

export function toUtcIso(value: DateTime): string {
  const iso = value.toUTC().toISO({ suppressMilliseconds: true });
  if (!iso) throw new Error("invalid instant");
  return iso;
}

function overlaps(aStart: DateTime, aEnd: DateTime, bStart: DateTime, bEnd: DateTime): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function evaluateSlot(now: Date, cfg: PolicyConfig, slot: Slot, busy: BusyRange[]): SlotDecision {
  const start = DateTime.fromISO(slot.start, { zone: "utc" });
  const end = DateTime.fromISO(slot.end, { zone: "utc" });
  if (!start.isValid || !end.isValid) {
    return { ok: false, status: 400, error: "Choose a valid time." };
  }
  const minutes = end.diff(start, "minutes").minutes;
  if (Math.abs(minutes - cfg.slotMinutes) > 0.001) {
    return { ok: false, status: 400, error: "That time is not available." };
  }

  const earliest = nextOwnerMidnight(now, cfg.ownerTz);
  const horizonEnd = earliest.plus({ days: cfg.horizonDays });
  if (start < earliest) {
    return { ok: false, status: 400, error: "Same-day times are not available. The earliest opening is the next Pacific calendar day." };
  }
  if (start >= horizonEnd) {
    return { ok: false, status: 400, error: "That time is outside the booking window." };
  }

  const local = start.setZone(cfg.ownerTz);
  if (!cfg.workDays.includes(local.weekday)) {
    return { ok: false, status: 400, error: "That day is outside working days." };
  }
  const startHm = parseHm(cfg.workStart);
  const endHm = parseHm(cfg.workEnd);
  const dayStart = local.set({
    hour: startHm.hour, minute: startHm.minute, second: 0, millisecond: 0
  });
  const dayEnd = local.set({
    hour: endHm.hour, minute: endHm.minute, second: 0, millisecond: 0
  });
  const slotEndLocal = local.plus({ minutes: cfg.slotMinutes });
  if (local < dayStart || slotEndLocal > dayEnd) {
    return { ok: false, status: 400, error: "That time is outside working hours." };
  }
  const offset = local.diff(dayStart, "minutes").minutes;
  if (Math.abs(offset - Math.round(offset)) > 0.001 || Math.round(offset) % cfg.slotMinutes !== 0) {
    return { ok: false, status: 400, error: "That time is not on the schedule." };
  }

  for (const block of busy) {
    const busyStart = DateTime.fromISO(block.start, { zone: "utc" }).minus({ minutes: cfg.bufferMinutes });
    const busyEnd = DateTime.fromISO(block.end, { zone: "utc" }).plus({ minutes: cfg.bufferMinutes });
    if (!busyStart.isValid || !busyEnd.isValid) continue;
    if (overlaps(start, end, busyStart, busyEnd)) {
      return { ok: false, status: 409, error: "That time was just taken. Pick another." };
    }
  }
  return { ok: true };
}

export function generateSlots(now: Date, cfg: PolicyConfig, busy: BusyRange[]): Slot[] {
  const earliest = nextOwnerMidnight(now, cfg.ownerTz);
  const horizonEnd = earliest.plus({ days: cfg.horizonDays });
  const startHm = parseHm(cfg.workStart);
  const endHm = parseHm(cfg.workEnd);
  const slots: Slot[] = [];
  for (let day = earliest; day < horizonEnd; day = day.plus({ days: 1 })) {
    if (!cfg.workDays.includes(day.weekday)) continue;
    let cursor = day.set({
      hour: startHm.hour, minute: startHm.minute, second: 0, millisecond: 0
    });
    const dayEnd = day.set({
      hour: endHm.hour, minute: endHm.minute, second: 0, millisecond: 0
    });
    while (cursor.plus({ minutes: cfg.slotMinutes }) <= dayEnd) {
      const slotEnd = cursor.plus({ minutes: cfg.slotMinutes });
      const slot = { start: toUtcIso(cursor), end: toUtcIso(slotEnd) };
      if (evaluateSlot(now, cfg, slot, busy).ok) slots.push(slot);
      cursor = cursor.plus({ minutes: cfg.slotMinutes });
    }
  }
  return slots;
}
