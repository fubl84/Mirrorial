#!/bin/bash

set -euo pipefail

PROJECT_ROOT=$(cd "$(dirname "$0")/.." && pwd)
FLUTTER="$PROJECT_ROOT/scripts/flutterw.sh"

cd "$PROJECT_ROOT/display_app"

"$FLUTTER" --version
"$FLUTTER" pub get
"$FLUTTER" analyze
"$FLUTTER" test
