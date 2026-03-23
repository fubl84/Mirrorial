# Flutter Setup

Mirrorial cannot run `flutter analyze` or build the display app unless the shell can find a Flutter SDK.

## Recommended local setup

1. Install the Flutter SDK on your Mac.
2. Make it discoverable in one of these ways:
   - put it at `$HOME/flutter`
   - export `FLUTTER_SDK_PATH=/absolute/path/to/flutter`
   - add `flutter` to your `PATH`
   - place a project-local SDK at `/Users/christophseiler/Development/Mirrorial/.local/flutter`
3. Verify the SDK is visible:

```bash
./scripts/flutterw.sh --version
```

## Verify the display app

Run the repo wrapper instead of calling `flutter` directly:

```bash
./scripts/check_display.sh
```

That runs:
- `flutter pub get`
- `flutter analyze`
- `flutter test`

## Run the mirror on macOS

```bash
./scripts/run_mac.sh
```

This starts:
- backend
- remote UI
- Flutter macOS display app

## Notes

- macOS desktop builds still require the usual native prerequisites on your machine, such as Xcode and CocoaPods.
- The wrapper script intentionally does not auto-download Flutter for local development. It fails fast and tells you where it looked.
