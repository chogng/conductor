#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceSvgPath = path.join(rootDir, "public", "logo.svg");
const iconDir = path.join(rootDir, "build", "icons");
const packageJsonPath = path.join(rootDir, "package.json");

const requiredPngSizes = [16, 20, 24, 32, 40, 48, 64, 70, 128, 150, 256, 300, 512, 1024];
const requiredIcoSizes = [16, 20, 24, 32, 40, 48, 64, 128, 256];

const fail = (message) => {
  console.error(`[verify-icons] ${message}`);
  process.exit(1);
};

const ensureFile = (filePath) => {
  if (!fs.existsSync(filePath)) {
    fail(`Missing file: ${path.relative(rootDir, filePath)}`);
  }
  const stat = fs.statSync(filePath);
  if (!stat.isFile() || stat.size <= 0) {
    fail(`Invalid file: ${path.relative(rootDir, filePath)} (${stat.size} bytes)`);
  }
  return stat;
};

const readPngSize = (filePath) => {
  const buffer = fs.readFileSync(filePath);
  const pngSignature = "89504e470d0a1a0a";
  if (buffer.subarray(0, 8).toString("hex") !== pngSignature) {
    fail(`Not a PNG file: ${path.relative(rootDir, filePath)}`);
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
};

const readIcoSizes = (filePath) => {
  const buffer = fs.readFileSync(filePath);
  if (buffer.length < 6 || buffer.readUInt16LE(0) !== 0 || buffer.readUInt16LE(2) !== 1) {
    fail(`Not a valid ICO file: ${path.relative(rootDir, filePath)}`);
  }

  const count = buffer.readUInt16LE(4);
  const sizes = new Set();
  for (let index = 0; index < count; index += 1) {
    const offset = 6 + index * 16;
    if (offset + 16 > buffer.length) {
      fail(`Truncated ICO directory: ${path.relative(rootDir, filePath)}`);
    }
    const width = buffer.readUInt8(offset) || 256;
    const height = buffer.readUInt8(offset + 1) || 256;
    if (width !== height) {
      fail(`Non-square ICO image ${width}x${height}: ${path.relative(rootDir, filePath)}`);
    }
    sizes.add(width);
  }
  return sizes;
};

const sourceStat = ensureFile(sourceSvgPath);
const sourceSvg = fs.readFileSync(sourceSvgPath, "utf8");
if (!sourceSvg.includes('viewBox="0 0 96 96"') || !sourceSvg.includes("<rect width=\"96\" height=\"96\"")) {
  fail("public/logo.svg does not look like the current Conductor icon source.");
}

let newestIconMtime = 0;
for (const size of requiredPngSizes) {
  const filePath = path.join(iconDir, `icon-${size}.png`);
  const stat = ensureFile(filePath);
  const dimensions = readPngSize(filePath);
  if (dimensions.width !== size || dimensions.height !== size) {
    fail(`Wrong PNG dimensions for icon-${size}.png: ${dimensions.width}x${dimensions.height}`);
  }
  if (stat.mtimeMs + 1000 < sourceStat.mtimeMs) {
    fail(`Stale generated icon: icon-${size}.png is older than public/logo.svg`);
  }
  newestIconMtime = Math.max(newestIconMtime, stat.mtimeMs);
}

const iconPngPath = path.join(iconDir, "icon.png");
const iconPngStat = ensureFile(iconPngPath);
const iconPngDimensions = readPngSize(iconPngPath);
if (iconPngDimensions.width !== 1024 || iconPngDimensions.height !== 1024) {
  fail(`Wrong PNG dimensions for icon.png: ${iconPngDimensions.width}x${iconPngDimensions.height}`);
}
if (iconPngStat.mtimeMs + 1000 < sourceStat.mtimeMs) {
  fail("Stale generated icon: icon.png is older than public/logo.svg");
}
newestIconMtime = Math.max(newestIconMtime, iconPngStat.mtimeMs);

const iconIcoPath = path.join(iconDir, "icon.ico");
const iconIcoStat = ensureFile(iconIcoPath);
const icoSizes = readIcoSizes(iconIcoPath);
for (const size of requiredIcoSizes) {
  if (!icoSizes.has(size)) {
    fail(`icon.ico is missing ${size}x${size}`);
  }
}
if (iconIcoStat.mtimeMs + 1000 < sourceStat.mtimeMs) {
  fail("Stale generated icon: icon.ico is older than public/logo.svg");
}
newestIconMtime = Math.max(newestIconMtime, iconIcoStat.mtimeMs);

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
const buildConfig = packageJson.build || {};
const expectedIco = "build/icons/icon.ico";
const expectedPng = "build/icons/icon.png";
const expectedIcns = "build/icons/icon.icns";

const expectedPackagePaths = {
  "build.win.icon": expectedIco,
  "build.nsis.installerIcon": expectedIco,
  "build.nsis.uninstallerIcon": expectedIco,
  "build.nsis.installerHeaderIcon": expectedIco,
  "build.linux.icon": expectedPng,
  "build.mac.icon": expectedIcns,
};

for (const [label, expected] of Object.entries(expectedPackagePaths)) {
  const actual = label
    .split(".")
    .slice(1)
    .reduce((value, key) => value?.[key], buildConfig);
  if (actual !== expected) {
    fail(`${label} should be ${expected}, got ${JSON.stringify(actual)}`);
  }
}

const extraResourceHasIcons = Array.isArray(buildConfig.extraResources)
  && buildConfig.extraResources.some((entry) => entry?.from === "build/icons" && entry?.to === "build/icons");
if (!extraResourceHasIcons) {
  fail('build.extraResources must include {"from":"build/icons","to":"build/icons"}');
}

const appxConfig = buildConfig.appx || {};
for (const key of ["identityName", "publisher", "displayName", "publisherDisplayName"]) {
  if (typeof appxConfig[key] !== "string" || appxConfig[key].trim() === "") {
    fail(`build.appx.${key} must be configured for Store packages`);
  }
}

console.log(
  `[verify-icons] OK: ${requiredPngSizes.length} PNG sizes, ${icoSizes.size} ICO sizes, package icon config points at build/icons.`,
);
console.log(`[verify-icons] Newest generated icon: ${new Date(newestIconMtime).toISOString()}`);
