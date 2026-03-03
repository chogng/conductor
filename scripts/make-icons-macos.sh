#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SRC_SVG="$ROOT_DIR/public/logo.svg"
OUT_DIR="$ROOT_DIR/build/icons"
ICONSET_DIR="/tmp/device-analysis.iconset"

if [[ ! -f "$SRC_SVG" ]]; then
  echo "Missing source SVG: $SRC_SVG" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"
rm -rf "$ICONSET_DIR"
mkdir -p "$ICONSET_DIR"

# Render source logo.svg to 1024x1024 PNG using macOS QuickLook.
qlmanage -t -s 1024 -o "$OUT_DIR" "$SRC_SVG" >/dev/null 2>&1
mv "$OUT_DIR/logo.svg.png" "$OUT_DIR/icon.png"

sips -z 16 16 "$OUT_DIR/icon.png" --out "$ICONSET_DIR/icon_16x16.png" >/dev/null
sips -z 32 32 "$OUT_DIR/icon.png" --out "$ICONSET_DIR/icon_16x16@2x.png" >/dev/null
sips -z 32 32 "$OUT_DIR/icon.png" --out "$ICONSET_DIR/icon_32x32.png" >/dev/null
sips -z 64 64 "$OUT_DIR/icon.png" --out "$ICONSET_DIR/icon_32x32@2x.png" >/dev/null
sips -z 128 128 "$OUT_DIR/icon.png" --out "$ICONSET_DIR/icon_128x128.png" >/dev/null
sips -z 256 256 "$OUT_DIR/icon.png" --out "$ICONSET_DIR/icon_128x128@2x.png" >/dev/null
sips -z 256 256 "$OUT_DIR/icon.png" --out "$ICONSET_DIR/icon_256x256.png" >/dev/null
sips -z 512 512 "$OUT_DIR/icon.png" --out "$ICONSET_DIR/icon_256x256@2x.png" >/dev/null
sips -z 512 512 "$OUT_DIR/icon.png" --out "$ICONSET_DIR/icon_512x512.png" >/dev/null
cp "$OUT_DIR/icon.png" "$ICONSET_DIR/icon_512x512@2x.png"

iconutil -c icns "$ICONSET_DIR" -o "$OUT_DIR/icon.icns"

# Build a minimal Windows .ico from a 256x256 PNG payload.
sips -z 256 256 "$OUT_DIR/icon.png" --out "$OUT_DIR/icon-256.png" >/dev/null
node -e "const fs=require('fs');const png=fs.readFileSync(process.argv[1]);const h=Buffer.alloc(6);h.writeUInt16LE(0,0);h.writeUInt16LE(1,2);h.writeUInt16LE(1,4);const e=Buffer.alloc(16);e.writeUInt8(0,0);e.writeUInt8(0,1);e.writeUInt8(0,2);e.writeUInt8(0,3);e.writeUInt16LE(1,4);e.writeUInt16LE(32,6);e.writeUInt32LE(png.length,8);e.writeUInt32LE(22,12);fs.writeFileSync(process.argv[2],Buffer.concat([h,e,png]));" "$OUT_DIR/icon-256.png" "$OUT_DIR/icon.ico"
rm -f "$OUT_DIR/icon-256.png"

echo "Generated:"
ls -la "$OUT_DIR/icon.png" "$OUT_DIR/icon.icns" "$OUT_DIR/icon.ico"
