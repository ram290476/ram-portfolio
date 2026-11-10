export interface BusyRange {
  start: string;
  end: string;
}

export interface Slot {
  start: string;
  end: string;
}

export interface Attendee {
  name: string;
  email?: string;
  phone?: string;
}

export interface CreatedEvent {
  id: string;
  start: string;
  end: string;
  htmlLink?: string;
}

export interface CalendarProvider {
  /** Busy intervals only. Never event titles, locations, or attendees. */
  getBusy(range: { start: string; end: string }): Promise<BusyRange[]>;
  /** Create the booking. Send an invite when the visitor left an email. */
  createEvent(slot: Slot, attendee: Attendee): Promise<CreatedEvent>;
  /** Create or update the visitor in the host's contacts. */
  upsertContact(attendee: Attendee): Promise<{ id: string } | null>;
  /** Optional plain confirmation. Graph also sends the calendar invite. */
  sendConfirmation?(to: string, slot: Slot, attendee: Attendee): Promise<void>;
}

export interface KvStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

export interface Env {
  CALENDAR_PROVIDER?: string;
  MS_CLIENT_ID?: string;
  MS_CLIENT_SECRET?: string;
  MS_REFRESH_TOKEN?: string;
  MS_TENANT?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_REFRESH_TOKEN?: string;
  SLOT_MINUTES?: string;
  BUFFER_MINUTES?: string;
  WORK_START?: string;
  WORK_END?: string;
  WORK_DAYS?: string;
  OWNER_TZ?: string;
  HORIZON_DAYS?: string;
  TURNSTILE_SECRET?: string;
  CORS_ORIGINS?: string;
  MAIL_CONFIRMATION?: string;
  RATE_LIMIT_MAX?: string;
  RATE_LIMIT_WINDOW_SECONDS?: string;
  /** Test-only. Ignored unless exactly "true". Never set this in production. */
  ALLOW_TEST_NOW?: string;
  RATE_LIMIT?: KvStore;
}

export interface PolicyConfig {
  slotMinutes: number;
  bufferMinutes: number;
  workStart: string;
  workEnd: string;
  workDays: number[];
  ownerTz: string;
  horizonDays: number;
}
