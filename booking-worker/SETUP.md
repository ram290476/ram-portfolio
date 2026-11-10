# Booking Worker setup

The portfolio stays a static site. This Worker is the only place that talks to Microsoft Graph. Nothing here is deployed yet, and this repository must not receive a client secret, refresh token, or Turnstile secret.

Calendar mailbox: `ram.vellamsetti@live.com` (personal Microsoft account).
Public contact on the site: `ram.vellamsetti@gmail.com`.
Owner time zone: `America/Los_Angeles`.

## 1. Entra app registration

1. Open the [Microsoft Entra admin center](https://entra.microsoft.com) → **App registrations** → **New registration**.
2. Name it `ram-portfolio-booking`. Do not put the word “Microsoft” in the name.
3. Supported account types: **Accounts in any organizational directory and personal Microsoft accounts**.
4. Redirect URI, platform **Web**: `https://book.ram.vellamsetti.com/oauth/callback`.
   A localhost URI is fine if you only use it once, from your own machine, to collect the refresh token. Remove it afterward.

## 2. Client secret

Certificates & secrets → New client secret. Copy the **Value** once. It goes into a Wrangler secret, not into git.

## 3. Delegated Graph permissions

Add Microsoft Graph delegated permissions:

- `Calendars.ReadWrite`
- `Contacts.ReadWrite`
- `Mail.Send`
- `User.Read`
- `offline_access`

A personal Microsoft account does not need admin consent. You consent as yourself in the next step.

## 4. One-time consent

Sign in as `ram.vellamsetti@live.com`. Tenant `consumers` (or `common`). Scopes are the five above. Use `prompt=consent`.

Exchange the authorization code for tokens and keep the **refresh token**. Do not paste the code or the tokens into chat, a commit, or `wrangler.toml`.

Personal Outlook.com accounts cannot use `getSchedule`. The Worker reads `calendarView` and returns busy intervals only.

## 5. Wrangler secrets and the KV namespace

```bash
cd booking-worker
npx wrangler kv namespace create RATE_LIMIT
```

Put the printed id into `wrangler.toml` in place of the all-zero placeholder.

```bash
npx wrangler secret put MS_CLIENT_ID
npx wrangler secret put MS_CLIENT_SECRET
npx wrangler secret put MS_REFRESH_TOKEN
npx wrangler secret put MS_TENANT
npx wrangler secret put TURNSTILE_SECRET
```

`MS_TENANT` value: `consumers`.

Optional, only if you later switch the provider:

```bash
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put GOOGLE_REFRESH_TOKEN
```

Non-secret policy already lives in `wrangler.toml` (`SLOT_MINUTES`, working hours, `CORS_ORIGINS`, `MAIL_CONFIRMATION`). Copy `.dev.vars.example` to `.dev.vars` for local `wrangler dev`. `.dev.vars` is gitignored. The example file has placeholders only.

`ALLOW_TEST_NOW` must never be set on the deployed Worker. It exists so unit tests can freeze the clock.

## 6. Turnstile

Create a widget for `ram.vellamsetti.com` (and the API host if the widget needs it).

- Site key → `config.js` `turnstileSiteKey` (this key is public).
- Secret key → `TURNSTILE_SECRET` above.

Leave `bookingApi` empty until the Worker has a URL. The page then stays on “Booking opens soon.”

The booking form lives on the homepage Contact section (`/#contact`). Old `/#book` links redirect there. When both values are ready:

```js
window.PORTFOLIO = {
  bookingApi: "https://book.ram.vellamsetti.com",
  turnstileSiteKey: "your-site-key"
};
```

The sentence above the slot picker reads the slot length from `GET /config`, so it stays aligned with `SLOT_MINUTES`.

## 7. DNS for the API host

Do this separately from the Pages domain. `ram.vellamsetti.com` already points at GitHub Pages.

Add a CNAME or Worker route for the API host, for example `book.ram.vellamsetti.com`, to this Worker. Put that origin in `CORS_ORIGINS` and in `config.js`.

## 8. Mac Contacts

On the Mac: **System Settings → Internet Accounts → Add Account → Microsoft**. Sign in as `ram.vellamsetti@live.com` and turn **Contacts** on.

Contacts the Worker creates with `POST /me/contacts` then sync into Contacts. The first sync can take a few minutes. Nothing is installed for the public site, and the Mac is not exposed to visitors.

Confirm with one test contact, then delete it if you do not want to keep it.

## 9. What the Worker enforces

- Slot length, buffer, weekday hours, and the horizon come from the Worker env.
- The earliest bookable instant is the start of the next `America/Los_Angeles` calendar day. `GET /slots` and `POST /book` both enforce that, including across the 2026 daylight-saving boundaries.
- Name is required. Email and phone are each optional, and at least one is required.
- Turnstile is checked before any Graph write. Rate limits use the KV namespace, per IP and, on booking, per email and per phone. Logs store a short hash, not the address or number.
- `POST /book` reads busy time again and returns 409 when the slot now overlaps, including the buffer.
- The event is created on `ram.vellamsetti@live.com` with the visitor as a required attendee when they left an email. Outlook sends that invite. Phone-only bookings have no attendee.
- `MAIL_CONFIRMATION=true` also sends a short mail. Leave it `false` until you want that extra note.
- A contact is created in the same mailbox.
- Responses contain open slots only. Subjects, locations, and attendees from existing events are not returned.

## 10. Smoke test, after the above is done

Book a far-future slot with a personal test email. Confirm the invite, the calendar event, the Outlook contact, and the Mac Contacts sync. Delete the test event and contact afterward.

Google Calendar is a stub behind the same interface. Leave `CALENDAR_PROVIDER=microsoft`. Switching later is a secret and a code change in the adapter, not a change to the page contract.
