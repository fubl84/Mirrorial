# Google Routes Setup

Mirrorial can use Google Routes for:

- traffic-aware car ETAs
- real public transport routes
- optionally all route modes if you enable the `Use Google Routes for all modes` toggle

This guide is the correct setup path for the current Mirrorial implementation.

## What you need to enable

For Mirrorial's current backend integration, you only need:

- a Google Cloud project
- billing enabled on that project
- the `Routes API` enabled
- one API key for server-side use

You do not need these for the current Mirrorial Google Routes feature:

- `Directions API (Legacy)`
- `Distance Matrix API (Legacy)`
- `Maps JavaScript API`
- `Maps SDK for Android`
- `Maps SDK for iOS`
- `Geocoding API`

Mirrorial currently calls the Routes API directly from the backend. It does not use the legacy Directions API, client-side Maps SDKs, or the Geocoding API for Google-backed routing.

## Step 1: Create or choose a Google Cloud project

1. Open the Google Cloud Console.
2. Create a new project or select an existing one.
3. Make sure billing is attached to that project.

Official setup reference:

- [Set up the Routes API](https://developers.google.com/maps/documentation/routes/get-api-key)

## Step 2: Enable the Routes API

Inside the selected project:

1. Open `APIs & Services`.
2. Click `Enable APIs and Services`.
3. Search for `Routes API`.
4. Enable `Routes API`.

That is the only Google Maps Platform API required for Mirrorial's current Google routing feature.

## Step 3: Create an API key

1. Open `APIs & Services` -> `Credentials`.
2. Click `Create Credentials`.
3. Choose `API key`.
4. Copy the created key.

## Step 4: Restrict the API key

This key is used server-side by the Mirrorial backend, so treat it as a backend secret.

Recommended restrictions:

1. Open the new API key in the Google Cloud Console.
2. Under `API restrictions`, choose `Restrict key`.
3. Select only:
   - `Routes API`

For `Application restrictions`:

- If your Mirrorial backend runs from a stable public server IP, use `IP addresses` and restrict it there.
- If your installation is local, self-hosted, or the outbound IP changes, IP restriction may not be practical. In that case, keep the key server-side only, never expose it in browser code, and still restrict it to `Routes API` only.

Official key security guidance:

- [Google Maps Platform security guidance](https://developers.google.com/maps/api-security-best-practices)

## Step 5: Add the key to Mirrorial

In Mirrorial:

1. Open `Integrations` -> `Travel`.
2. Turn on `Enable Google Routes`.
3. Paste the key into `Google Routes API Key`.
4. Decide whether to enable `Use Google Routes for all modes`.

Recommended starting setup:

- `Enable Google Routes`: on
- `Use Google Routes for all modes`: off
- `Base Routing Provider`: `OpenRouteService`

That gives you:

- Google Routes for `car`
- Google Routes for `public transport`
- OpenRouteService for `bike`
- OpenRouteService for `walk`

If you want to avoid OpenRouteService completely, also turn on:

- `Use Google Routes for all modes`

## Step 6: Save and verify

1. Click `Save Config`.
2. In the same `Travel` section, click `Run Travel Debug`.
3. Confirm that the debug panel shows:
   - `Google Routes: Enabled`
   - `Google API Key: Configured`
   - route `Source: google_routes` for car or public transport items

## Troubleshooting

### `Google API Key: Missing`

The key was not saved, or the field is empty.

### `public transport` still shows unsupported

Check:

- `Enable Google Routes` is on
- the Google Routes API key is saved
- you clicked `Save Config`

### Requests fail after enabling the key

Most common causes:

- billing is not enabled
- the `Routes API` is not enabled
- the API key is restricted to the wrong API
- the API key has an IP restriction that does not match your backend's outgoing IP

### Do I need Geocoding API too?

Not for the current Mirrorial Google Routes integration.

Mirrorial can send address strings directly to Google Routes for route calculation.

## Notes

- Google Maps Platform usage is not fully free. Check current pricing and free monthly credits before enabling this in production.
- For Mirrorial, prefer a dedicated backend-only key for Google Routes rather than reusing a browser-side or unrelated Maps key.

Official product references:

- [Routes API overview](https://developers.google.com/maps/documentation/routes)
- [Set up the Routes API](https://developers.google.com/maps/documentation/routes/get-api-key)
- [Transit routes](https://developers.google.com/maps/documentation/routes/transit-route)
