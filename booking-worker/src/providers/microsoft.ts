import type { Attendee, BusyRange, CalendarProvider, CreatedEvent, Env, Slot } from "../types";

interface GraphEvent {
  showAs?: string;
  isCancelled?: boolean;
  subject?: string;
  start?: { dateTime?: string };
  end?: { dateTime?: string };
}

function asUtc(value: string): string {
  if (/[zZ]$/.test(value) || /[+-]\d{2}:\d{2}$/.test(value)) return new Date(value).toISOString().replace(".000Z", "Z");
  return new Date(value + "Z").toISOString().replace(".000Z", "Z");
}

export class MicrosoftGraphProvider implements CalendarProvider {
  private token: { value: string; expiresAt: number } | null = null;

  constructor(private env: Env, private fetchImpl: typeof fetch = fetch) {}

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;
    const tenant = this.env.MS_TENANT || "consumers";
    const body = new URLSearchParams({
      client_id: this.env.MS_CLIENT_ID || "",
      client_secret: this.env.MS_CLIENT_SECRET || "",
      refresh_token: this.env.MS_REFRESH_TOKEN || "",
      grant_type: "refresh_token",
      scope: [
        "https://graph.microsoft.com/Calendars.ReadWrite",
        "https://graph.microsoft.com/Contacts.ReadWrite",
        "https://graph.microsoft.com/Mail.Send",
        "https://graph.microsoft.com/User.Read",
        "offline_access"
      ].join(" ")
    });
    const response = await this.fetchImpl(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body
    });
    if (!response.ok) throw new Error("token refresh failed");
    const payload = await response.json() as { access_token?: string; expires_in?: number };
    if (!payload.access_token) throw new Error("token refresh failed");
    this.token = {
      value: payload.access_token,
      expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000
    };
    return payload.access_token;
  }

  private async graph(pathOrUrl: string, init: RequestInit = {}): Promise<Response> {
    const token = await this.accessToken();
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${token}`);
    headers.set("prefer", 'outlook.timezone="UTC"');
    const url = pathOrUrl.startsWith("http") ? pathOrUrl : `https://graph.microsoft.com/v1.0${pathOrUrl}`;
    return this.fetchImpl(url, { ...init, headers });
  }

  async getBusy(range: { start: string; end: string }): Promise<BusyRange[]> {
    const ranges: BusyRange[] = [];
    let url: string | null =
      `/me/calendarView?startDateTime=${encodeURIComponent(range.start)}&endDateTime=${encodeURIComponent(range.end)}&$select=start,end,showAs,isCancelled&$top=100`;
    let pages = 0;
    while (url && pages < 20) {
      pages += 1;
      const response = await this.graph(url);
      if (!response.ok) throw new Error("calendar read failed");
      const payload = await response.json() as { value?: GraphEvent[]; "@odata.nextLink"?: string };
      for (const event of payload.value ?? []) {
        if (event.isCancelled || event.showAs === "free") continue;
        if (!event.start?.dateTime || !event.end?.dateTime) continue;
        ranges.push({ start: asUtc(event.start.dateTime), end: asUtc(event.end.dateTime) });
      }
      url = payload["@odata.nextLink"] ?? null;
    }
    return ranges;
  }

  async createEvent(slot: Slot, attendee: Attendee): Promise<CreatedEvent> {
    const lines = [`Intro call with ${attendee.name}.`];
    if (attendee.email) lines.push(`Email: ${attendee.email}`);
    if (attendee.phone) lines.push(`Phone: ${attendee.phone}`);
    if (!attendee.email) lines.push("No email was provided, so Outlook will not send an invite.");
    const response = await this.graph("/me/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        subject: `Intro call: ${attendee.name}`,
        body: { contentType: "Text", content: lines.join("\n") },
        start: { dateTime: slot.start.replace(/Z$/, ""), timeZone: "UTC" },
        end: { dateTime: slot.end.replace(/Z$/, ""), timeZone: "UTC" },
        isOnlineMeeting: false,
        attendees: attendee.email
          ? [{ emailAddress: { address: attendee.email, name: attendee.name }, type: "required" }]
          : []
      })
    });
    if (!response.ok) throw new Error("event create failed");
    const payload = await response.json() as { id?: string; webLink?: string };
    if (!payload.id) throw new Error("event create failed");
    return { id: payload.id, start: slot.start, end: slot.end, htmlLink: payload.webLink };
  }

  async upsertContact(attendee: Attendee): Promise<{ id: string } | null> {
    const response = await this.graph("/me/contacts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        givenName: attendee.name,
        displayName: attendee.name,
        emailAddresses: attendee.email ? [{ address: attendee.email, name: attendee.name }] : [],
        mobilePhone: attendee.phone ?? null
      })
    });
    if (!response.ok) throw new Error("contact create failed");
    const payload = await response.json() as { id?: string };
    return payload.id ? { id: payload.id } : null;
  }

  async sendConfirmation(to: string, slot: Slot, attendee: Attendee): Promise<void> {
    const response = await this.graph("/me/sendMail", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: {
          subject: "Intro call confirmed",
          body: {
            contentType: "Text",
            content: `Hello ${attendee.name},\n\nYour intro call is booked from ${slot.start} to ${slot.end} (UTC).\n`
          },
          toRecipients: [{ emailAddress: { address: to, name: attendee.name } }]
        },
        saveToSentItems: true
      })
    });
    if (!response.ok) throw new Error("confirmation failed");
  }
}
