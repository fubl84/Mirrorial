# Mirrorial Display

The display app is a Flutter project.

## Local verification

From the repository root, use the wrapper scripts instead of calling `flutter` directly:

```bash
./scripts/flutterw.sh --version
./scripts/check_display.sh
```

If the wrapper cannot find a Flutter SDK, follow [../FLUTTER_SETUP.md](../FLUTTER_SETUP.md).

## macOS development

```bash
./scripts/run_mac.sh
```

That starts the backend, the Remote UI, and the Flutter macOS display app.
