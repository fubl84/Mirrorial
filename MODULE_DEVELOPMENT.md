# 🛠 Mirrorial Module Development Guide

Welcome to the Mirrorial plugin ecosystem! 

Because Mirrorial is designed for maximum performance on resource-constrained hardware (like the Raspberry Pi Zero 2W), it uses a **Compiled Native Engine** rather than a heavy web browser. 

This means 3rd-party modules are written in **Dart (Flutter)** and compiled directly into the application. Don't worry—it's incredibly easy.

---

## Step 1: Create Your Module File
Navigate to `display_app/lib/widgets/modules/` and create a new Dart file for your module. For this example, let's create `bitcoin_module.dart`.

A Mirrorial module is simply a Flutter `StatelessWidget` or `ConsumerWidget` (if you need state) that accepts a `config` Map.

```dart
import 'package:flutter/material.dart';

class BitcoinModule extends StatelessWidget {
  final Map config; // This comes from the Remote UI's config.json

  const BitcoinModule({super.key, required this.config});

  @override
  Widget build(BuildContext context) {
    // 1. Read your config values
    final currency = config['currency'] ?? 'USD';

    // 2. Use the Global Theme for consistency
    final theme = Theme.of(context).textTheme;

    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Icon(Icons.currency_bitcoin, color: Colors.orange, size: 48),
        Text(
          'Bitcoin',
          style: theme.bodyMedium, // Uses the user's secondary color
        ),
        Text(
          '99,000 $currency', 
          style: theme.displayLarge, // Uses the user's primary color & font size
        ),
      ],
    );
  }
}
```

---

## Step 2: Register in the Flutter App
To tell the layout engine about your new module, you must register it.

Open `display_app/lib/module_registry.dart` and add your module to the switch statement:

```dart
import 'package:flutter/material.dart';
import 'widgets/modules/clock_module.dart';
// ... other imports
import 'widgets/modules/bitcoin_module.dart'; // 1. Import your file

Widget buildModuleFromRegistry(String type, Map config) {
  switch (type) {
    case 'clock':
      return ClockModule(config: config);
    // ... other cases
    
    // 2. Add your case here! The string must match the JSON 'type'.
    case 'bitcoin':
      return BitcoinModule(config: config);
      
    default:
      return Center(child: Text('Unknown Module'));
  }
}
```

---

## Step 3: Add to the Remote UI (Dashboard)
To allow users to select your module in the Layout Editor, you need to add it to the Remote UI's dropdown list.

Open `remote_ui/src/App.jsx` and find the `MODULE_TYPES` array at the top of the file:

```javascript
const MODULE_TYPES = [
  { id: 'clock', label: 'Clock & Date', icon: '🕒' },
  { id: 'weather', label: 'Weather', icon: '🌤' },
  { id: 'home_assistant', label: 'Home Assistant', icon: '🏠' },
  { id: 'calendar', label: 'Google Calendar', icon: '📅' },
  // ADD YOUR MODULE HERE:
  { id: 'bitcoin', label: 'Bitcoin Tracker', icon: '₿' },
];
```

If your module requires default configuration values (like an API key), update the `addModuleToPane` function in the same file:

```javascript
  const addModuleToPane = (paneId, type) => {
    const newModule = {
      type,
      config: type === 'weather' ? { location: 'Berlin', apiKey: '' } : 
              type === 'home_assistant' ? { url: '', token: '', entities: [] } : 
              type === 'bitcoin' ? { currency: 'USD' } : {} // <-- Add defaults here
    };
    // ...
```

---

## Step 4: Build and Deploy!
Because you've added native code, you must recompile the display engine and rebuild the Remote UI. 

SSH into your Pi and run:
```bash
cd ~/Mirrorial
./scripts/install_deps.sh    # Rebuilds the Remote UI
./scripts/build_display.sh   # Recompiles the Flutter App
```
Once the build is complete, refresh `http://mirror.local:3000`, open the Layout Editor, and add your new module to the grid!

---

## Advanced: The Event Bus (Inter-Module Communication)
Does your module need to alert the user globally? You can broadcast events to the Mirrorial `AlertOverlay`.

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/event_bus.dart';

// Inside a ConsumerWidget's method:
ref.read(eventBusProvider.notifier).emit(
  SystemEvent(
    type: SystemEventType.generalInfo,
    message: 'Bitcoin just crossed 100k!',
  )
);
```
