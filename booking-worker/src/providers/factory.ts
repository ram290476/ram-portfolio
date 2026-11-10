import type { CalendarProvider, Env } from "../types";
import { GoogleCalendarProvider } from "./google";
import { MicrosoftGraphProvider } from "./microsoft";

export function createProvider(env: Env, fetchImpl: typeof fetch = fetch): CalendarProvider {
  if ((env.CALENDAR_PROVIDER || "microsoft").toLowerCase() === "google") {
    return new GoogleCalendarProvider();
  }
  return new MicrosoftGraphProvider(env, fetchImpl);
}
