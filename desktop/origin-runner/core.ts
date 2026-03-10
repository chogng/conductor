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

export function getOriginBridgeWorkDir(jobDir) {
  return path.join(jobDir, ".ob");
}

export function getOriginBridgeFilePaths(workDir) {
  return {
    logPath: path.join(workDir, "originbridge.log"),
    errorPath: path.join(workDir, "error.txt"),
  };
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

export function normalizeOriginExePath(inputPath) {
  if (typeof inputPath !== "string") return null;
  const normalized = inputPath.trim();
  return normalized || null;
}

export function normalizeOriginPathKey(inputPath) {
  const normalized = normalizeOriginExePath(inputPath);
  return normalized ? normalized.toLowerCase() : null;
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

