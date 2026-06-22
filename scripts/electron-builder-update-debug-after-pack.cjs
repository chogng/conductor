const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const findRcedit = (projectDir) => {
  const bundledRcedit = path.join(
    projectDir,
    "node_modules",
    "electron-winstaller",
    "vendor",
    "rcedit.exe",
  );
  if (fs.existsSync(bundledRcedit)) {
    return bundledRcedit;
  }

  const cacheRoot = process.env.LOCALAPPDATA
    ? path.join(process.env.LOCALAPPDATA, "electron-builder", "Cache", "winCodeSign")
    : null;
  if (!cacheRoot || !fs.existsSync(cacheRoot)) {
    return null;
  }

  const stack = [cacheRoot];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.name === "rcedit-x64.exe") {
        return fullPath;
      }
    }
  }

  return null;
};

module.exports = async (context) => {
  if (context.electronPlatformName !== "win32") {
    return;
  }

  const projectDir = context.packager.projectDir;
  const productFilename = context.packager.appInfo.productFilename;
  const exePath = path.join(context.appOutDir, `${productFilename}.exe`);
  const iconPath = path.join(projectDir, "resources", "win32", "icon.ico");
  const markerPath = path.join(context.appOutDir, "resources", "update-debug-build");
  const rceditPath = findRcedit(projectDir);

  if (!fs.existsSync(exePath)) {
    throw new Error(`[update-debug-after-pack] App executable not found: ${exePath}`);
  }
  if (!fs.existsSync(iconPath)) {
    throw new Error(`[update-debug-after-pack] Icon not found: ${iconPath}`);
  }
  if (!rceditPath) {
    throw new Error("[update-debug-after-pack] rcedit.exe not found.");
  }

  console.log(`[update-debug-after-pack] Setting app icon: ${exePath}`);
  execFileSync(rceditPath, [exePath, "--set-icon", iconPath], {
    stdio: "inherit",
  });

  fs.writeFileSync(markerPath, "update-debug\n", "utf8");
};
