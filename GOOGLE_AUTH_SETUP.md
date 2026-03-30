# Google Auth Setup

Status for `v1.0`: Mirrorial supports Google Calendar for local development and advanced self-hosted deployments. A brokered one-click consumer pairing service is not part of `v1.0`.

Mirrorial currently uses a backend-owned Google OAuth flow:

- The Remote UI opens a popup.
- Google redirects back to the Mirrorial backend.
- The backend exchanges the code and stores tokens locally in `~/.config/mirrorial`.

This is the correct base for calendar sync and later context features.

## 1. What you need in Google Cloud

1. Create or select a Google Cloud project.
2. Enable the Google Calendar API.
3. Configure the OAuth consent screen.
4. Create an OAuth client of type `Web application`.

You will receive:

- `Client ID`
- `Client secret`

## 2. Development setup

Use this when running Mirrorial on your Mac.

### Recommended values

- App origin: `http://localhost:5173` for the Vite UI
- Backend callback: `http://localhost:3000/api/auth/google/callback`

### In Google Cloud

Set the following on the Web OAuth client:

- Authorized JavaScript origins:
  - `http://localhost:5173`
  - optionally `http://localhost:3000` if you also serve the built UI from the backend
- Authorized redirect URIs:
  - `http://localhost:3000/api/auth/google/callback`

### In Mirrorial

Open the Remote UI and enter:

- `OAuth Client ID`
- `OAuth Client Secret`
- `Redirect URI` = `http://localhost:3000/api/auth/google/callback`

Then:

1. Save config.
2. Click `Connect Google`.
3. Complete the popup consent flow.
4. Select which calendars should be mirrored.

## 3. Production setup

There are two realistic production models.

### A. Direct self-hosted HTTPS

Use this if the mirror backend is reachable through a proper HTTPS domain.

Example:

- Mirror backend: `https://mirror.example.com`
- Redirect URI: `https://mirror.example.com/api/auth/google/callback`

In Google Cloud:

- Authorized JavaScript origin:
  - `https://mirror.example.com`
- Authorized redirect URI:
  - `https://mirror.example.com/api/auth/google/callback`

In Mirrorial:

- Set `Redirect URI` to the same HTTPS callback.

This is the supported `v1.0` production shape for Google Calendar.

### B. Consumer mirror on home LAN

Example:

- `http://mirror.local`
- `http://192.168.1.20:3000`

This is where Google auth becomes awkward. A local hostname or LAN IP is not a strong long-term production shape for browser OAuth. For an OSS consumer product, the recommended architecture is:

- Mirrorial device creates a short-lived pairing request.
- User authenticates against a public HTTPS broker such as `https://auth.mirrorial.app`.
- The broker hands the resulting account connection back to the device.

That broker is not implemented in this repo for `v1.0`. The current direct popup flow is best suited to development and controlled HTTPS deployments managed by technical self-hosters.

## 4. Current scopes

The backend currently requests:

- `https://www.googleapis.com/auth/calendar.readonly`
- `https://www.googleapis.com/auth/calendar.calendarlist.readonly`

These are enough to:

- read the user's calendar list
- let the user choose which calendars to mirror
- sync events into the local cache

## 5. Where Mirrorial stores Google data

Mirrorial stores runtime data outside the repo:

- secrets: `~/.config/mirrorial/secrets.json`
- connected Google account: `~/.config/mirrorial/accounts/google-account.json`
- synced calendar cache: `~/.config/mirrorial/cache/calendar-events.json`
- derived context cache: `~/.config/mirrorial/cache/context.json`

## 6. Production readiness notes

Before public release you should expect to handle:

- OAuth consent screen verification
- privacy policy / support links for Google review
- app branding and domain ownership
- sensitive-scope review if Google requires it for your release mode

## 7. Troubleshooting

### `redirect_uri_mismatch`

The callback in Google Cloud does not exactly match the `Redirect URI` saved in Mirrorial.

### Popup opens but returns to an error page

Check:

- backend is reachable on the callback URL
- `Client ID`, `Client Secret`, and `Redirect URI` are saved in Mirrorial
- the backend host matches the registered redirect URI exactly

### UI says connected but no calendars appear

Check:

- selected scopes were granted
- the Google account actually has visible calendars
- backend can reach Google APIs from the network it is running on

### Pi / mirror.local deployment

Use Mac/local dev first. For a Pi reachable only as `http://mirror.local` or a LAN IP, treat Google Calendar as an advanced setup and expect to configure a proper HTTPS endpoint if you want the direct OAuth flow to work reliably.
