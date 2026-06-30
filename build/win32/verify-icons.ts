#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const rootDir = path.resolve(import.meta.dirname, "..", "..");
const win32ResourceDir = path.join(rootDir, "resources", "win32");
const darwinResourceDir = path.join(rootDir, "resources", "darwin");
const linuxResourceDir = path.join(rootDir, "resources", "linux");
const appxDir = path.join(win32ResourceDir, "appx");
const packageJsonPath = path.join(rootDir, "package.json");

const requiredPngSizes = [16, 20, 24, 32, 40, 48, 64, 70, 71, 128, 150, 256, 300, 512, 1024, 1080, 2160];
const requiredIcoSizes = [16, 20, 24, 32, 40, 48, 64, 128, 256];
const requiredIcnsTypes = ["icp4", "icp5", "icp6", "ic07", "ic08", "ic09", "ic10"];
const requiredDarwinDockAssets = {
  "icon.png": [1024, 1024],
};
const requiredDarwinTrayAssets = {
  "trayTemplate.png": [16, 16],
  "trayTemplate@2x.png": [32, 32],
};
const requiredAppxAssets = {
  "StoreLogo.png": [50, 50],
  "Square44x44Logo.png": [44, 44],
  "Square150x150Logo.png": [150, 150],
  "Wide310x150Logo.png": [310, 150],
  "SmallTile.png": [71, 71],
  "LargeTile.png": [310, 310],
};

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

const readIcnsTypes = (filePath) => {
  const buffer = fs.readFileSync(filePath);
  if (buffer.length < 8 || buffer.toString("ascii", 0, 4) !== "icns") {
    fail(`Not a valid ICNS file: ${path.relative(rootDir, filePath)}`);
  }

  const declaredSize = buffer.readUInt32BE(4);
  if (declaredSize !== buffer.length) {
    fail(`Wrong ICNS length for ${path.relative(rootDir, filePath)}: declared ${declaredSize}, actual ${buffer.length}`);
  }

  const types = new Set();
  let offset = 8;
  while (offset < buffer.length) {
    if (offset + 8 > buffer.length) {
      fail(`Truncated ICNS entry: ${path.relative(rootDir, filePath)}`);
    }

    const type = buffer.toString("ascii", offset, offset + 4);
    const length = buffer.readUInt32BE(offset + 4);
    if (length < 8 || offset + length > buffer.length) {
      fail(`Invalid ICNS entry ${type}: ${path.relative(rootDir, filePath)}`);
    }

    types.add(type);
    offset += length;
  }

  return types;
};

const readBmpSize = (filePath) => {
  const buffer = fs.readFileSync(filePath);
  if (buffer.length < 26 || buffer.toString("ascii", 0, 2) !== "BM") {
    fail(`Not a valid BMP file: ${path.relative(rootDir, filePath)}`);
  }
  return {
    width: buffer.readInt32LE(18),
    height: Math.abs(buffer.readInt32LE(22)),
  };
};

let newestIconMtime = 0;
for (const size of requiredPngSizes) {
  const filePath = path.join(win32ResourceDir, `icon-${size}.png`);
  const stat = ensureFile(filePath);
  const dimensions = readPngSize(filePath);
  if (dimensions.width !== size || dimensions.height !== size) {
    fail(`Wrong PNG dimensions for icon-${size}.png: ${dimensions.width}x${dimensions.height}`);
  }
  newestIconMtime = Math.max(newestIconMtime, stat.mtimeMs);
}

const iconPngPath = path.join(linuxResourceDir, "icon.png");
const iconPngStat = ensureFile(iconPngPath);
const iconPngDimensions = readPngSize(iconPngPath);
if (iconPngDimensions.width !== 1024 || iconPngDimensions.height !== 1024) {
  fail(`Wrong PNG dimensions for icon.png: ${iconPngDimensions.width}x${iconPngDimensions.height}`);
}
newestIconMtime = Math.max(newestIconMtime, iconPngStat.mtimeMs);

const sourceIconPath = path.join(win32ResourceDir, "icon-2160.png");
const sourceIconStat = ensureFile(sourceIconPath);
const sourceIconDimensions = readPngSize(sourceIconPath);
if (sourceIconDimensions.width !== 2160 || sourceIconDimensions.height !== 2160) {
  fail(`Wrong PNG dimensions for icon-2160.png: ${sourceIconDimensions.width}x${sourceIconDimensions.height}`);
}
newestIconMtime = Math.max(newestIconMtime, sourceIconStat.mtimeMs);

const iconIcoPath = path.join(win32ResourceDir, "icon.ico");
const iconIcoStat = ensureFile(iconIcoPath);
const icoSizes = readIcoSizes(iconIcoPath);
for (const size of requiredIcoSizes) {
  if (!icoSizes.has(size)) {
    fail(`icon.ico is missing ${size}x${size}`);
  }
}
newestIconMtime = Math.max(newestIconMtime, iconIcoStat.mtimeMs);

const iconIcnsPath = path.join(darwinResourceDir, "icon.icns");
const iconIcnsStat = ensureFile(iconIcnsPath);
const icnsTypes = readIcnsTypes(iconIcnsPath);
for (const type of requiredIcnsTypes) {
  if (!icnsTypes.has(type)) {
    fail(`icon.icns is missing ${type}`);
  }
}
newestIconMtime = Math.max(newestIconMtime, iconIcnsStat.mtimeMs);

for (const [name, [width, height]] of Object.entries(requiredDarwinDockAssets)) {
  const filePath = path.join(darwinResourceDir, name);
  const stat = ensureFile(filePath);
  const dimensions = readPngSize(filePath);
  if (dimensions.width !== width || dimensions.height !== height) {
    fail(`Wrong macOS dock asset dimensions for resources/darwin/${name}: ${dimensions.width}x${dimensions.height}`);
  }
  newestIconMtime = Math.max(newestIconMtime, stat.mtimeMs);
}

for (const [name, [width, height]] of Object.entries(requiredDarwinTrayAssets)) {
  const filePath = path.join(darwinResourceDir, name);
  const stat = ensureFile(filePath);
  const dimensions = readPngSize(filePath);
  if (dimensions.width !== width || dimensions.height !== height) {
    fail(`Wrong macOS tray asset dimensions for resources/darwin/${name}: ${dimensions.width}x${dimensions.height}`);
  }
  newestIconMtime = Math.max(newestIconMtime, stat.mtimeMs);
}

for (const [name, [width, height]] of Object.entries(requiredAppxAssets)) {
  const filePath = path.join(appxDir, name);
  const stat = ensureFile(filePath);
  const dimensions = readPngSize(filePath);
  if (dimensions.width !== width || dimensions.height !== height) {
    fail(`Wrong AppX asset dimensions for resources/win32/appx/${name}: ${dimensions.width}x${dimensions.height}`);
  }
  newestIconMtime = Math.max(newestIconMtime, stat.mtimeMs);
}

const installerHeaderPath = path.join(win32ResourceDir, "header.bmp");
const installerSidebarPath = path.join(win32ResourceDir, "sidebar.bmp");
const installerHeaderStat = ensureFile(installerHeaderPath);
const installerSidebarStat = ensureFile(installerSidebarPath);
const installerHeaderSize = readBmpSize(installerHeaderPath);
const installerSidebarSize = readBmpSize(installerSidebarPath);
if (installerHeaderSize.width !== 150 || installerHeaderSize.height !== 57) {
  fail(`Wrong BMP dimensions for resources/win32/header.bmp: ${installerHeaderSize.width}x${installerHeaderSize.height}`);
}
if (installerSidebarSize.width !== 164 || installerSidebarSize.height !== 314) {
  fail(`Wrong BMP dimensions for resources/win32/sidebar.bmp: ${installerSidebarSize.width}x${installerSidebarSize.height}`);
}
newestIconMtime = Math.max(newestIconMtime, installerHeaderStat.mtimeMs, installerSidebarStat.mtimeMs);

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
const buildConfig = packageJson.build || {};
const expectedIco = "icon.ico";
const expectedPng = "../linux/icon.png";
const expectedIcns = "../darwin/icon.icns";

const expectedPackagePaths = {
  "build.win.icon": expectedIco,
  "build.nsis.installerIcon": expectedIco,
  "build.nsis.uninstallerIcon": expectedIco,
  "build.nsis.installerHeaderIcon": expectedIco,
  "build.nsis.installerHeader": "header.bmp",
  "build.nsis.installerSidebar": "sidebar.bmp",
  "build.nsis.uninstallerSidebar": "sidebar.bmp",
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
  && buildConfig.extraResources.some((entry) => entry?.from === "resources/win32" && entry?.to === "resources/win32")
  && buildConfig.extraResources.some((entry) => entry?.from === "resources/darwin" && entry?.to === "resources/darwin")
  && buildConfig.extraResources.some((entry) => entry?.from === "resources/linux" && entry?.to === "resources/linux");
if (!extraResourceHasIcons) {
  fail('build.extraResources must include win32, darwin, and linux resource directories.');
}

console.log(
  `[verify-icons] OK: ${requiredPngSizes.length} PNG sizes, ${icoSizes.size} ICO sizes, ${requiredIcnsTypes.length} ICNS entries, macOS dock/tray assets, AppX assets, installer bitmaps and package icon config are aligned.`,
);
console.log(`[verify-icons] Newest icon file: ${new Date(newestIconMtime).toISOString()}`);
