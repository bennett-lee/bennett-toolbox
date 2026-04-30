#!/usr/bin/env zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
VENV_DIR="$ROOT_DIR/build_tools/markitdown-venv"
DIST_DIR="$ROOT_DIR/build_tools/markitdown-dist"
WORK_DIR="$ROOT_DIR/build_tools/markitdown-build"
VENDOR_DIR="$ROOT_DIR/vendor/markitdown"

cleanup_failed_build() {
  rm -rf "$VENV_DIR" "$DIST_DIR" "$WORK_DIR"
}

trap cleanup_failed_build ERR

python3 -m venv "$VENV_DIR"
"$VENV_DIR/bin/pip" install --upgrade pip
"$VENV_DIR/bin/pip" install pyinstaller 'markitdown[all]'

rm -rf "$DIST_DIR" "$WORK_DIR" "$VENDOR_DIR"
mkdir -p "$VENDOR_DIR"

"$VENV_DIR/bin/pyinstaller" \
  --clean \
  --onefile \
  --collect-data magika \
  --name markitdown \
  --distpath "$DIST_DIR" \
  --specpath "$WORK_DIR" \
  --workpath "$WORK_DIR" \
  "$ROOT_DIR/scripts/markitdown_launcher.py"

cp "$DIST_DIR/markitdown" "$VENDOR_DIR/markitdown"
chmod +x "$VENDOR_DIR/markitdown"
rm -rf "$VENV_DIR" "$DIST_DIR" "$WORK_DIR"

echo "Built $VENDOR_DIR/markitdown"
