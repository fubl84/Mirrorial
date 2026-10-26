# Mirrorial

Current release target: `v1.0`

Mirrorial is an open source smart mirror platform built around a native Flutter display, a lightweight Node.js backend, and a browser-based remote configuration UI. The project is designed to avoid the usual Chromium-heavy smart mirror stack and instead focus on a faster, lower-overhead display pipeline that fits Raspberry Pi and desktop development workflows.

Developed by **Christoph Seiler | Flaming Battenberg**.

## What Mirrorial includes

- `display_app/`: Flutter display application for the mirror surface
- `backend/`: Express-based API, config service, OAuth handler, and proxy layer
- `remote_ui/`: React + Vite control panel for remote configuration
- `scripts/`: setup, verification, and local development helper scripts
- `configs/config.json.example`: starter configuration template

## Current feature set

- Native Flutter display app with configurable mirror modules
- Remote web UI for layout and integration settings
- Config-driven grid layout for mirror widgets
- Clock, weather, calendar, Home Assistant, daily brief, and travel time modules
- Calendar subscriptions (iCal / webcal links) and CalDAV sync through one backend calendar pipeline, with optional direct Google Calendar
- Household-aware Daily Brief, birthday overlays, and per-member age reveal control
- Google Calendar OAuth flow handled by the backend for advanced self-hosted setups
- Runtime cache and account storage outside the repository in `~/.config/mirrorial`
- macOS development workflow for running backend, UI, and display together
- Raspberry Pi oriented unattended install path for self-hosted deployment

## Architecture

Mirrorial is split into three cooperating parts:

1. The Flutter display app renders the mirror UI and reacts to configuration changes.
2. The backend serves APIs, hosts the built remote UI, persists runtime state, and handles integrations such as Google Calendar.
3. The remote UI provides the browser-based control surface for editing layout, theme, and service settings.

The backend reads the project-level `config.json` and keeps user-specific runtime data under `~/.config/mirrorial`, including secrets, connected accounts, and caches.

## Quick start for local development

### Requirements

- Node.js and npm
- Flutter SDK available to the repo wrapper
- For macOS display development: Xcode and CocoaPods

If Flutter is not on your `PATH`, Mirrorial looks for it in one of these places:

- `$HOME/flutter`
- `$FLUTTER_SDK_PATH`
- `./.local/flutter`

More details: [FLUTTER_SETUP.md](./FLUTTER_SETUP.md)

### 1. Create the config file

From the repository root:

```bash
cp configs/config.json.example config.json
```

### 2. Start the full macOS development stack

From the repository root:

```bash
./scripts/run_mac.sh
```

This starts:

- the backend on `http://localhost:3000`
- the remote UI on `http://localhost:5173`
- the Flutter macOS display app

## Manual component commands

If you want to run parts separately:

### Backend

```bash
cd backend
npm install
npm start
```

### Remote UI

```bash
cd remote_ui
npm install
npm run dev
```

### Display app

Use the wrapper rather than calling `flutter` directly:

```bash
./scripts/flutterw.sh --version
./scripts/check_display.sh
```

To run the macOS display app directly:

```bash
cd display_app
../scripts/flutterw.sh pub get
../scripts/flutterw.sh run -d macos --dart-define=LOCAL_CONFIG_PATH="$(pwd)/../config.json"
```

## Configuration and integrations

Mirrorial uses a root-level `config.json` for system, theme, layout, and module configuration. The example file already contains a sample grid layout with modules for:

- clock
- weather
- daily brief
- calendar
- Home Assistant

Additional travel settings, calendar sources, birthday behavior, and household metadata are configured in the Remote UI and normalized by the backend for older config files.

Google Calendar setup is documented here:

- [GOOGLE_AUTH_SETUP.md](./GOOGLE_AUTH_SETUP.md)
- [GOOGLE_ROUTES_SETUP.md](./GOOGLE_ROUTES_SETUP.md)

Runtime data is stored outside the repository, primarily in:

- `~/.config/mirrorial/secrets.json`
- `~/.config/mirrorial/accounts/google-account.json`
- `~/.config/mirrorial/cache/`

## Raspberry Pi and self-hosted deployment

The repository includes Linux-oriented setup and maintenance scripts in `scripts/`, including:

- `scripts/install_linux.sh`
- `scripts/install_pi.sh`
- `scripts/setup.sh`
- `scripts/install_deps.sh`
- `scripts/install_engine.sh`
- `scripts/register_services.sh`
- `scripts/check_health.sh`

Installer profile selection is automatic. The entrypoint detects the host and chooses the best matching install profile.

Support tiers:

- Supported: Raspberry Pi Zero 2 W or newer on Raspberry Pi OS Trixie 64-bit, tested and verified
- Experimental: Raspberry Pi Zero 2 W or newer on Raspberry Pi OS Bookworm 64-bit, not tested recently but expected to work
- Experimental: other Debian-family Linux boards with `apt`, `systemd`, DRM/KMS, and `arm64` or `amd64`

Recommended installer command from a freshly cloned repo:

```bash
./scripts/install_linux.sh --no-reboot
```

On low-memory boards such as the Raspberry Pi Zero 2 W, a prebuilt display bundle is strongly recommended over an on-device release build:

```bash
./scripts/install_linux.sh --no-reboot --display-bundle /path/to/mirrorial-display-bundle-arm64-flutterpi.tar.gz
```

GitHub Actions artifact downloads can also be passed directly as `.zip` files:

```bash
./scripts/install_linux.sh --no-reboot --display-bundle /path/to/mirrorial-display-bundle-arm64-flutterpi.zip
```

Compatibility wrappers remain available:

```bash
./scripts/install_pi.sh --no-reboot
./scripts/setup.sh --no-reboot
```

Use `--dry-run` to inspect the steps first. Use `--profile` to force a detected profile when needed. The installer is designed to run unattended, install dependencies, build the remote UI and display bundle, register services, and run a health check.

For the display pipeline, Mirrorial uses `flutter-pi` plus the project-local `flutterpi_tool build` workflow to produce the deployable bundle. The Linux installer pins the Flutter SDK used for that build to a known-compatible version instead of following the latest Flutter stable release.

### Prebuilt display bundles

The recommended deployment workflow for slower boards is:

1. Build and package `display_app/bundle` on a stronger machine.
2. Copy or publish the resulting `.tar.gz` archive, or the `.zip` downloaded from GitHub Actions.
3. Pass that archive to `scripts/install_linux.sh --display-bundle ...` on the target device.

Build and package the bundle on the stronger machine:

```bash
./scripts/package_display_bundle.sh
```

That writes a `.tar.gz` archive under `./dist/` by default.

If you already have a freshly built `display_app/bundle`, package it without rebuilding:

```bash
./scripts/package_display_bundle.sh --skip-build
```

Install from a local archive on the target device:

```bash
./scripts/install_linux.sh --no-reboot --display-bundle /absolute/path/to/mirrorial-display-bundle-arm64-flutterpi.tar.gz
# or the GitHub Actions artifact download:
./scripts/install_linux.sh --no-reboot --display-bundle /absolute/path/to/mirrorial-display-bundle-arm64-flutterpi.zip
```

Install from a remote archive URL on the target device:

```bash
./scripts/install_linux.sh --no-reboot --display-bundle https://example.com/mirrorial-display-bundle-arm64-flutterpi.tar.gz
```

On-device display builds remain available, but they are experimental on very small boards and may take a long time due to swap pressure.

### GitHub Actions option

The repository can also prepare the prebuilt display bundle in GitHub Actions.

Included workflow:

- `.github/workflows/build-display-bundle.yml`

Behavior:

- manual trigger only via `workflow_dispatch`
- builds the `arm64` flutter-pi bundle on `ubuntu-24.04-arm`
- uploads `mirrorial-display-bundle-arm64-flutterpi.tar.gz` as a workflow artifact

Recommended usage:

1. Open the `Actions` tab in GitHub.
2. Run `Build Display Bundle`.
3. Download the uploaded artifact.
4. Copy the downloaded `.zip` or the contained `.tar.gz` to the target Pi, or host it somewhere reachable.
5. Install with:

```bash
./scripts/install_linux.sh --no-reboot --display-bundle /absolute/path/to/mirrorial-display-bundle-arm64-flutterpi.zip
```

For public repositories, standard GitHub-hosted runners are free to use, and `workflow_dispatch` runs can only be started by users with write access. See GitHub's billing docs for current details: [GitHub Actions billing](https://docs.github.com/en/billing/managing-billing-for-github-actions/about-billing-for-github-actions), [GitHub-hosted runners reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners).

## Testing and verification

### Backend tests

```bash
cd backend
npm test
```

### Remote UI production build

```bash
cd remote_ui
npm run build
```

### Flutter validation

```bash
./scripts/check_display.sh
```

## Project structure

```text
Mirrorial/
├── backend/         # Express API, OAuth, config, caching, integrations
├── display_app/     # Flutter mirror display
├── remote_ui/       # React/Vite remote control interface
├── scripts/         # Setup, run, verification, and deployment helpers
├── configs/         # Example configuration files
├── LICENSE          # MIT license
└── README.md        # Project overview
```

## Open source

Mirrorial is open source and released under the [MIT License](./LICENSE).

If you use, modify, or extend it, keep the license terms with the project and review integration credentials carefully before deploying on a public or shared system.

## Connecting calendars

The recommended way is a **calendar subscription link**, which works with any provider and needs no developer account:

1. In your calendar app, copy the iCal / subscription link (Google: "Secret address in iCal format", Apple/Outlook/Nextcloud: the published or shared calendar link). Links starting with `webcal://` work as they are.
2. In the Remote UI open **Integrations > Calendars**, add an ICS feed, paste the link and press **Test this link**. It shows the calendar name and the next events before you save.
3. Optional: enter your own e-mail address(es) for that calendar so events you declined are hidden.

CalDAV accounts (Nextcloud, iCloud, Fastmail, ...) are available as well. The direct Google connection is kept as an optional advanced setup.

Treat a subscription link like a password: anyone with it can read the calendar. Mirrorial stores it on the device and shows it in the Remote UI and to the display app (as the event link). It is not part of what is sent to the AI provider, but it is not hidden from anyone who has the access token.

## Controlling what the daily brief mentions

Under **Integrations > LLM Context** you can add words for three lists: always show, never show, and repeating events that count as routine. Matching ignores upper/lower case and accents (`Fußball` finds `fussball`). Schedule changes (Ersatz, entfällt, verschoben, cancelled, moved) and doctor or therapy appointments are always shown, even when they repeat, unless you list a word from them under "never show".

## How the AI notes are made

The mirror's notes are built in two steps so the AI cannot invent anything:

1. **Mirrorial works out the facts itself:** what is on today and tomorrow, overlapping appointments, little time between two places, schedule changes, medical appointments without a location, an early start tomorrow, a busy day, leave-by times and rain on days someone leaves the house. Calendar text is treated as data, never as instructions.
2. **The AI only phrases them.** Each note has to name the facts it is based on. Notes that cite nothing, contain a link, or mention a time, duration or temperature that is not in those facts are discarded. Overlaps, schedule changes and tight transitions the AI left out are added by Mirrorial itself, so they cannot go missing, even when the AI provider is down.

On a quiet day there is nothing to say and the AI is not called. In the evening (from 18:00) the focus moves to tomorrow. Under **Integrations > LLM Context** the *Brief engine* can be switched back to the previous engine for one release.

### Choosing an AI provider

Under **Integrations > LLM Context** pick OpenAI, Anthropic, Google, or *Custom / local* (anything that speaks the OpenAI chat protocol, e.g. Ollama or LM Studio; set its Base URL). The model field suggests current model names, and you can type any other. Press **Test connection** after entering the key: it sends one tiny request with what is on screen, says in plain words what is wrong (wrong key, unknown model, no credit, unreachable server), and shows whether the provider returned structured JSON and how many tokens it used.

Mirrorial asks each provider for schema-checked JSON when it supports it and falls back to plain JSON when it does not (for example with older models or small local models). Temporary provider errors (rate limit, overload, timeouts) are retried up to three times. The debug view of the Daily Brief shows how the model was reached (`call`: mode, tokens, requests). The notes are checked by Mirrorial in every case, so a weaker model can only make the AI part fall back to the built-in notes, not show wrong facts.

What leaves the device in *Cloud redacted* mode: titles, places and times of today's and tomorrow's events plus the computed facts. Event notes, prep notes and addresses are only sent in *Full context*, and nothing is sent in *Off*.

## Security model

The backend API is protected by an access token.

- **Where the token is.** On first start the backend creates `~/.config/mirrorial/access-token` (mode 600) and prints it in the log. You can also set your own with the `MIRRORIAL_ACCESS_TOKEN` environment variable (at least 16 characters).
- **Remote UI.** Open the remote UI from another device and it asks for the token. It is kept in that browser's local storage.
- **The mirror itself.** Requests from the same machine (the Flutter display on `127.0.0.1`) work without a token. They are only trusted when there is no proxy header and neither `Host` nor `Origin` is a DNS name. Set `MIRRORIAL_TRUST_LOCAL=false` to disable this.
- **Reverse proxy.** A proxy on the same machine is never treated as local, because it adds `X-Forwarded-*` headers, so clients behind it always need the token. If the remote UI is served from a hostname, list it in `MIRRORIAL_ALLOWED_ORIGINS` (comma separated) so the browser may call the API.
- **Lost token.** Read the file on the Pi, or delete it and restart the backend to generate a new one.
- **Stored keys.** An API key (LLM, routing) is only sent to the endpoint it was entered for. If you change the provider or base URL, enter the key again. The Home Assistant token is never sent to the browser. The UI shows only whether one is stored.
- **Outbound URLs.** LLM, Home Assistant and calendar URLs must be `http(s)`, may not contain credentials, and may not point to link-local/cloud-metadata addresses.


## Developer

Mirrorial is developed by **Christoph Seiler | Flaming Battenberg**.
