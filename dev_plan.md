# Mirrorial Development Plan

## Phase 1: Project Scaffolding & Environment
**Goal:** Establish the directory structure and the "One-Command" installation entry point.
- [ ] Create directory structure: `display_app/` (Flutter), `backend/` (Node.js), `remote_ui/` (React), `scripts/`.
- [ ] Draft `setup.sh`:
    - [ ] Install system dependencies (`libgbm-dev`, `libdrm-dev`, `libegl-dev`, `libgles-dev`, `libasound2-dev`).
    - [ ] Install `flutter-pi` (compiled from source or binary download).
    - [ ] Set up `avahi-daemon` for `mirror.local` resolution.
    - [ ] Configure `systemd` units for `mirror-display` and `mirror-backend`.
- [ ] Define `config.json` schema: Coordinates, API keys, rotation, and FPS settings.

## Phase 2: The Communication Bridge (Backend)
**Goal:** Create the Node.js service that acts as the source of truth.
- [ ] Initialize `backend/` with Express and `chokidar` for file watching.
- [ ] Implement API endpoints for:
    - [ ] Updating `config.json`.
    - [ ] Performing OAuth2 handshakes (Google Calendar proxy).
    - [ ] System controls (reboot, shutdown, screen blanking).
- [ ] Implement a WebSocket server for real-time logs and "Live Preview" data.

## Phase 3: The Native Display Engine (Flutter)
**Goal:** Build the high-performance renderer using `flutter-pi`.
- [ ] Initialize `display_app/` with Riverpod for state management.
- [ ] Implement `ConfigurationService`:
    - [ ] Watch `config.json` using `dart:io` file hooks.
    - [ ] Parse settings and update the global `AppState`.
- [ ] Build the **FlexGrid Layout Engine**:
    - [ ] A dynamic container that calculates module sizes based on flex-grow/basis values from the config.
- [ ] Implement **Global Features**:
    - [ ] `FPSThrottler`: Support for 30 FPS (default) and 60 FPS (high performance).
    - [ ] `RotationWrapper`: A top-level widget that applies 0/90/180/270 degree transforms.
    - [ ] `ThemeManager`: Real-time font/color injection.

## Phase 4: Integration Modules
**Goal:** Implement the v1 module suite.
- [ ] **Clock & Date:** 30fps-safe animations, customizable formats.
- [ ] **Weather:** OpenWeatherMap integration with localized caching.
- [ ] **Google Calendar:** OAuth2 flow via the Backend proxy; multi-calendar support.
- [ ] **Home Assistant:** Native WebSocket client to sync entity states in real-time.
- [ ] **Inter-Module Bus:** Allow modules to broadcast events (e.g., "Alert" module darkening the screen).

## Phase 5: Remote UI (The Dashboard)
**Goal:** Create a beautiful React-based configuration dashboard.
- [ ] Build the **Layout Designer**:
    - [ ] A visual "Flex" editor to manage panes and module assignments.
- [ ] **Integration Center**:
    - [ ] Step-by-step wizards for HA Tokens and Google Auth.
- [ ] **Styling Suite**:
    - [ ] Live color pickers and typography selectors.
- [ ] **Deployment**: Optimize the Vite build for serving from the Pi's internal storage.

## Phase 6: Performance Tuning & Validation
**Goal:** Ensure 60FPS potential on Pi Zero 2W.
- [ ] Profile memory usage and eliminate leaks in the Flutter app.
- [ ] Test `setup.sh` on a clean Pi OS Lite image (simulated or real).
- [ ] Implement "Smart Blanking": Automatic display sleep based on schedules.
