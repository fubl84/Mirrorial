# Mirrorial Module Store Architecture

## The Challenge
Unlike web-based smart mirrors that can evaluate JavaScript on the fly, Mirrorial is a compiled binary. You cannot simply "download and run" new Dart code at runtime.

## The Solution: Automated Source-Patching & Recompilation
When a user clicks "Install" on a module in the store, the Mirrorial Node.js backend will automate the steps a developer would normally take manually, then trigger a background recompile.

### 1. The Store API (Central Registry)
We create a central repository (e.g., a GitHub repo with a `registry.json` file or a simple API) that lists available modules.
```json
[
  {
    "id": "bitcoin_tracker",
    "name": "Bitcoin Tracker",
    "author": "Satoshi",
    "description": "Displays live Bitcoin prices.",
    "version": "1.0.0",
    "dart_file_url": "https://raw.githubusercontent.com/.../bitcoin_module.dart",
    "default_config": { "currency": "USD" },
    "icon": "₿"
  }
]
```

### 2. The Remote UI (The Storefront)
We add a "Store" tab to the React dashboard.
* It fetches the `registry.json` from the internet.
* It displays the modules with their descriptions and a big "Install" button.
* When clicked, it sends a `POST /api/modules/install { id: "bitcoin_tracker" }` to the local Pi backend.

### 3. The Backend Installer (Node.js)
This is where the magic happens. The Node.js backend performs the following automated steps:
1. **Download:** Fetches `bitcoin_module.dart` and saves it to `display_app/lib/widgets/modules/`.
2. **Code Injection (AST / Regex):** 
   * Opens `display_app/lib/module_registry.dart`.
   * Injects the `import` statement at the top.
   * Injects the `case 'bitcoin_tracker': return BitcoinModule(config: config);` into the switch statement.
3. **UI Injection:**
   * Opens `remote_ui/src/App.jsx`.
   * Injects the module definition into the `MODULE_TYPES` array.

### 4. The Compilation Engine
Because recompiling on a Pi Zero 2W takes ~20 minutes, the backend must handle this gracefully:
* The backend spawns a child process to run `./scripts/build_display.sh`.
* It opens a WebSocket connection to the Remote UI to stream the build logs in real-time.
* The React UI shows a "Installing & Compiling... Please do not unplug your Pi" progress screen.
* Once the build finishes, the display service restarts automatically, and the new module is available in the Layout Editor.

## Pros and Cons
**Pros:**
* Maintains the buttery-smooth 60FPS native performance.
* Extremely easy for end-users (one click).
* Module developers don't have to learn a complex API; they just write standard Flutter widgets.

**Cons:**
* Installation isn't instant; it requires a wait time for compilation on low-end hardware.
* Automated code injection carries a small risk of file corruption if the registry file format changes unexpectedly.
