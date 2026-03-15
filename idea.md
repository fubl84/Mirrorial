Mirrorial
Mirrorial is a high-performance, native smart mirror ecosystem designed specifically for the Raspberry Pi Zero 2W (and other Pi Boards). Unlike traditional smart mirror software that relies on heavy, memory-hungry web browsers (Electron/Chromium), Mirrorial is built as a compiled Flutter application. It communicates directly with the GPU via DRM/KMS for buttery-smooth 60FPS animations while maintaining a minimal RAM footprint.

🚀 The Philosophy
Zero-Browser: No Chromium, no WebKit, no overhead. Just raw, compiled performance.

Remote-First: Configuration is handled via a dedicated web dashboard accessible at http://mirror.local.

Modular Grid: A layout-agnostic system where modules are assigned to customizable panes.

One-Touch Install: A streamlined setup process that takes a fresh Raspberry Pi OS Lite image to a functional mirror in one command.

🛠 Core Features (v1)
1. Native Display Engine
Dynamic Grid Layout: Configure rows and columns via the Remote UI to create a custom dashboard structure.

Hardware-Accelerated Rotation: Rotate the entire UI (90°, 180°, 270°) instantly without modifying system-level boot files.

Live Styling: Real-time updates for fonts, colors, and scaling without restarting the application.

Smooth modern animations looking modern, stylish and lively.

2. Integrated Modules
📅 Google Calendar: Full OAuth2 integration. Support for multi-calendar selection with custom color-coding per sub-calendar.

🏠 Home Assistant: Native WebSocket integration to display real-time entity states (sensors, lights, climate) and data points.

🌤 Weather: Localized weather reporting including current conditions and forecasts via OpenWeatherMap API.

🕒 Time & Date: Highly legible, customizable clock with support for multiple timezones and relative time offsets.

Long-term plan: support for custom modules - module builder api

3. Mirrorial Remote UI (mirror.local)
A lightweight background service that provides a beautiful web interface for:

Network & API Setup: Home Assistant Long-Lived Access Tokens, and Google API credentials.

Pane Management: A visual editor to assign specific modules to grid coordinates.

System Controls: Remote reboot, screen blanking schedules, and software updates, add to autostart so it starts in fullscreen on bootup.

🏗 Technical Stack
Frontend: Flutter (Dart)

Embedder: flutter-pi (DRM/KMS rendering)

Backend/Config: Python (Flask) or Node.js (Express)

OS: Raspberry Pi OS Lite (64-bit/32-bit)

Communication: Local config.json with file-watcher triggers for instant UI updates.

📦 Installation
Mirrorial is designed to be installed with a single command on a clean Raspberry Pi OS Lite installation:

Bash
git clone https://github.com/your-username/Mirrorial.git
cd Mirrorial
sudo ./install.sh


v1 Feature Roadmap
1. The Core Display Engine (Flutter)
Grid System: A custom layout manager where you define a grid (e.g., 10x10) and assign modules to row_start, row_end, col_start, col_end.

Native Rotation: Handled via the Flutter Transform widget or SystemChrome. This allows you to rotate the UI 90/180/270° instantly via the web config without rebooting the Pi.

Module Ecosystem:

Weather: Uses OpenWeatherMap API (location-based).

Clock/Date: Native Dart Stream for per-second updates.

Google Calendar: OAuth2 flow with googleapis package. Support for filtering by calendarId.

Home Assistant: WebSocket connection to fetch entity states (sensor, light, switch).

2. The Remote UI (mirror.local)
Backend: A lightweight Python/Flask or Node.js service running on the Pi.

Control Panel:

Layout Tab: Visual drag-and-drop or coordinate input for panes.

Integration Tab: Input fields for HA Tokens, Google Client IDs, and Weather API keys.

Styling Tab: Real-time color picker and font selection (saved to a local config.json).

DNS: Uses avahi-daemon to ensure you can always reach it at http://mirror.local.

v1 Architecture Diagram
Implementation Plan
Phase 1: Preparation (The "One Command" Goal)
You will create a setup.sh script in your GitHub repo that:

Updates the Pi and installs flutter-pi dependencies (libgbm-dev, libdrm-dev, etc.).

Configures GPU Memory to 64MB and enables Fake KMS (required for hardware acceleration).

Sets the Pi to Console Autologin (no desktop environment).

Phase 2: The "Module" System
In Flutter, you'll treat each mirror element as a Widget.

WeatherModule(location, apiKey)

CalendarModule(selectedCalendars, colors)

HomeAssistantModule(entityId, icon)

Phase 3: Configuration Persistence
The Flutter app will use a FileWatcher on a config.json file.

Whenever you save settings in the Remote UI, the JSON updates, and the Flutter app triggers a setState() to redraw the mirror instantly.

Project Structure (GitHub)
Plaintext
/
├── display_app/        # Flutter source code
├── config_server/      # Python/Flask Remote UI
├── setup.sh            # The "One Command" installer
└── config.json.example # Default configuration template
The "One-Command" Installation Dream
Once your repo is ready, the setup on a fresh Pi Zero 2W will look like this:

Bash
git clone https://github.com/your-username/MirrorNative.git && cd MirrorNative && sudo ./setup.sh
