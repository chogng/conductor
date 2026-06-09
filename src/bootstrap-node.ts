import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { IProductConfiguration } from "./bootstrap-meta.js";

interface NativeParsedArgs {
  readonly "user-data-dir"?: string;
}

function getApplicationPath(): string {
  const appRoot = path.dirname(import.meta.dirname);

  if (process.env.ELECTRON_START_URL) {
    return process.cwd();
  }

  if (!process.env.CONDUCTOR_DEV && process.env.NODE_ENV !== "development") {
    if (process.platform === "darwin") {
      return path.dirname(path.dirname(path.dirname(appRoot)));
    }

    return path.dirname(path.dirname(appRoot));
  }

  return appRoot;
}

export function configurePortable(product: Partial<IProductConfiguration>): { portableDataPath: string; isPortable: boolean } {
  const applicationPath = getApplicationPath();
  const portableRoot = process.platform === "darwin" ? path.dirname(applicationPath) : applicationPath;
  const portableDataPath = process.env.CONDUCTOR_PORTABLE || path.join(
    portableRoot,
    product.portable || `${product.applicationName}-portable-data`,
  );
  const isPortable = fs.existsSync(portableDataPath);
  const portableTempPath = path.join(portableDataPath, "tmp");
  const isTempPortable = isPortable && fs.existsSync(portableTempPath);

  if (isPortable) {
    process.env.CONDUCTOR_PORTABLE = portableDataPath;
  } else {
    delete process.env.CONDUCTOR_PORTABLE;
  }

  if (isTempPortable) {
    if (process.platform === "win32") {
      process.env.TMP = portableTempPath;
      process.env.TEMP = portableTempPath;
    } else {
      process.env.TMPDIR = portableTempPath;
    }
  }

  return { portableDataPath, isPortable };
}

export function getUserDataPath(cliArgs: NativeParsedArgs, productName: string): string {
  const portablePath = process.env.CONDUCTOR_PORTABLE;
  if (portablePath) {
    return path.join(portablePath, "user-data");
  }

  if (cliArgs["user-data-dir"]) {
    return path.resolve(process.cwd(), cliArgs["user-data-dir"]);
  }

  switch (process.platform) {
    case "win32":
      return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), productName);
    case "darwin":
      return path.join(os.homedir(), "Library", "Application Support", productName);
    case "linux":
      return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), productName);
    default:
      return path.join(os.homedir(), `.${productName}`);
  }
}
