import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

export type RunProcessResult = {
  code: number;
  stdout: string;
  stderr: string;
};

export type RunProcessOptions = {
  cwd?: string;
  windowsHide?: boolean;
  [key: string]: unknown;
};

export function ensureDir(dirPath) {
  if (!dirPath || typeof dirPath !== "string") {
    throw new Error("Invalid directory path.");
  }
  fs.mkdirSync(dirPath, { recursive: true });
}

export function sanitizeFileName(name) {
  const raw = String(name || "device_analysis_origin.zip");
  const cleaned = raw
    .replace(/[/\\?%*:|"<>]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || "device_analysis_origin.zip";
}

function escapePsSingleQuoted(input) {
  return String(input || "").replace(/'/g, "''");
}

export function getPowerShellExePath() {
  const systemRoot = process.env.SystemRoot || "C:\\Windows";
  const candidate = path.join(
    systemRoot,
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe",
  );
  return fs.existsSync(candidate) ? candidate : "powershell.exe";
}

export function runProcess(
  exePath: string,
  args: string[],
  options: RunProcessOptions = {},
): Promise<RunProcessResult> {
  return new Promise<RunProcessResult>((resolve, reject) => {
    const runOptions = options && typeof options === "object" ? options : {};
    const cwd = Reflect.get(runOptions, "cwd");
    const windowsHide = Reflect.get(runOptions, "windowsHide");

    const child = spawn(exePath, args, {
      cwd: typeof cwd === "string" && cwd ? cwd : undefined,
      windowsHide: windowsHide !== false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      resolve({
        code: Number.isInteger(code) ? code : -1,
        stdout,
        stderr,
      });
    });
  });
}

export async function expandArchive(zipPath, destinationPath) {
  const psCommand = `Expand-Archive -LiteralPath '${escapePsSingleQuoted(
    zipPath,
  )}' -DestinationPath '${escapePsSingleQuoted(destinationPath)}' -Force`;

  const result = await runProcess(
    getPowerShellExePath(),
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", psCommand],
    { windowsHide: true },
  );
  const resultObj = result && typeof result === "object" ? result : {};
  const code = Number(Reflect.get(resultObj, "code"));
  const stderr = String(Reflect.get(resultObj, "stderr") || "");
  const stdout = String(Reflect.get(resultObj, "stdout") || "");

  if (code !== 0) {
    throw new Error(
      `Failed to extract ZIP (${code}): ${
        stderr || stdout || "unknown error"
      }`,
    );
  }
}

export function normalizeZipBuffer(bytes) {
  if (Buffer.isBuffer(bytes)) return bytes;
  if (bytes instanceof ArrayBuffer) return Buffer.from(bytes);
  if (ArrayBuffer.isView(bytes)) {
    return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  if (Array.isArray(bytes)) return Buffer.from(bytes);
  throw new Error("Invalid ZIP payload bytes.");
}

export function normalizeOriginExePath(inputPath) {
  if (typeof inputPath !== "string") return null;
  const normalized = inputPath.trim();
  return normalized || null;
}

export function assertOriginExePath(originExePath) {
  const normalized = normalizeOriginExePath(originExePath);
  if (!normalized) {
    throw new Error("Origin executable path is empty.");
  }
  if (!path.isAbsolute(normalized)) {
    throw new Error("Origin executable path must be absolute.");
  }
  if (!fs.existsSync(normalized)) {
    throw new Error(`Origin executable not found: ${normalized}`);
  }
  const stat = fs.statSync(normalized);
  if (!stat.isFile()) {
    throw new Error(`Origin executable path is not a file: ${normalized}`);
  }
  return normalized;
}

export function assertDirectoryPath(dirPath, label = "Directory path") {
  const normalized = normalizeOriginExePath(dirPath);
  if (!normalized) {
    throw new Error(`${label} is empty.`);
  }
  if (!path.isAbsolute(normalized)) {
    throw new Error(`${label} must be absolute.`);
  }
  if (!fs.existsSync(normalized)) {
    throw new Error(`${label} not found: ${normalized}`);
  }
  const stat = fs.statSync(normalized);
  if (!stat.isDirectory()) {
    throw new Error(`${label} is not a directory: ${normalized}`);
  }
  return normalized;
}

export function parseJsonFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    const raw = String(fs.readFileSync(filePath, "utf8") || "").trim();
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}


