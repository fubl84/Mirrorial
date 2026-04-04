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
- Google Calendar, ICS, and CalDAV sync through one backend calendar pipeline
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

- Supported: Raspberry Pi Zero 2 W or newer on Raspberry Pi OS Bookworm 64-bit
- Experimental: Raspberry Pi Zero 2 W or newer on Raspberry Pi OS Trixie 64-bit
- Experimental: other Debian-family Linux boards with `apt`, `systemd`, DRM/KMS, and `arm64` or `amd64`

Recommended installer command from a freshly cloned repo:

```bash
./scripts/install_linux.sh --no-reboot
```

Compatibility wrappers remain available:

```bash
./scripts/install_pi.sh --no-reboot
./scripts/setup.sh --no-reboot
```

Use `--dry-run` to inspect the steps first. Use `--profile` to force a detected profile when needed. The installer is designed to run unattended, install dependencies, build the remote UI and display bundle, register services, and run a health check.

For the display pipeline, Mirrorial uses `flutter-pi` plus the project-local `flutterpi_tool build` workflow to produce the deployable bundle. The Linux installer pins the Flutter SDK used for that build to a known-compatible version instead of following the latest Flutter stable release.

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

## Developer

Mirrorial is developed by **Christoph Seiler | Flaming Battenberg**.
