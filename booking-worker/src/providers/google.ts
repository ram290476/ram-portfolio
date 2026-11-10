import type { Attendee, BusyRange, CalendarProvider, CreatedEvent, Slot } from "../types";

/**
 * Swappable Google Calendar adapter. Not the default, and not wired to a live
 * OAuth client. Selecting CALENDAR_PROVIDER=google fails closed until this
 * stub is replaced with freeBusy.query and events.insert.
 */
export class GoogleCalendarProvider implements CalendarProvider {
  async getBusy(_range: { start: string; end: string }): Promise<BusyRange[]> {
    throw new Error("google adapter is not enabled");
  }

  async createEvent(_slot: Slot, _attendee: Attendee): Promise<CreatedEvent> {
    throw new Error("google adapter is not enabled");
  }

  async upsertContact(_attendee: Attendee): Promise<{ id: string } | null> {
    throw new Error("google adapter is not enabled");
  }

  async sendConfirmation(_to: string, _slot: Slot, _attendee: Attendee): Promise<void> {
    throw new Error("google adapter is not enabled");
  }
}
