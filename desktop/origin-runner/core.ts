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
  env?: NodeJS.ProcessEnv;
  windowsHide?: boolean;
  timeoutMs?: number;
  maxOutputBytes?: number;
  [key: string]: unknown;
};

export type JsonObject = Record<string, unknown>;

export function ensureDir(dirPath: unknown): asserts dirPath is string {
  if (!dirPath || typeof dirPath !== "string") {
    throw new Error("Invalid directory path.");
  }
  fs.mkdirSync(dirPath, { recursive: true });
}

export function sanitizeFileName(name: unknown): string {
  const raw = String(name || "device_analysis_origin.zip");
  const cleaned = raw
    .replace(/[/\\?%*:|"<>]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || "device_analysis_origin.zip";
}

export function getOriginBridgeWorkDir(jobDir: string): string {
  return path.join(jobDir, ".ob");
}

export function getOriginBridgeFilePaths(workDir: string): { logPath: string; errorPath: string } {
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
    const env = Reflect.get(runOptions, "env");
    const windowsHide = Reflect.get(runOptions, "windowsHide");
    const timeoutMsRaw = Number(Reflect.get(runOptions, "timeoutMs"));
    const timeoutMs =
      Number.isFinite(timeoutMsRaw) && timeoutMsRaw > 0
        ? Math.floor(timeoutMsRaw)
        : 0;
    const maxOutputBytesRaw = Number(Reflect.get(runOptions, "maxOutputBytes"));
    const maxOutputBytes =
      Number.isFinite(maxOutputBytesRaw) && maxOutputBytesRaw > 0
        ? Math.floor(maxOutputBytesRaw)
        : 0;

    const child = spawn(exePath, args, {
      cwd: typeof cwd === "string" && cwd ? cwd : undefined,
      env: env && typeof env === "object" ? env as NodeJS.ProcessEnv : process.env,
      windowsHide: windowsHide !== false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let stdoutTruncated = false;
    let stderrTruncated = false;
    let settled = false;
    let timeout: NodeJS.Timeout | null = null;

    const appendOutput = (
      current: string,
      currentBytes: number,
      chunk: unknown,
    ): { text: string; bytes: number; truncated: boolean } => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
      if (!maxOutputBytes) {
        return {
          text: current + buffer.toString(),
          bytes: currentBytes + buffer.length,
          truncated: false,
        };
      }

      const remainingBytes = maxOutputBytes - currentBytes;
      if (remainingBytes <= 0) {
        return { text: current, bytes: currentBytes, truncated: true };
      }
      if (buffer.length <= remainingBytes) {
        return {
          text: current + buffer.toString(),
          bytes: currentBytes + buffer.length,
          truncated: false,
        };
      }

      return {
        text: current + buffer.subarray(0, remainingBytes).toString(),
        bytes: maxOutputBytes,
        truncated: true,
      };
    };

    const clearProcessTimeout = () => {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
    };

    if (timeoutMs > 0) {
      timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        try {
          child.kill();
        } catch {
          // Process may have already exited.
        }
        const error = new Error(
          `Process timed out after ${timeoutMs}ms: ${exePath}`,
        );
        Reflect.set(error, "code", "ETIMEDOUT");
        Reflect.set(error, "stdout", stdout);
        Reflect.set(error, "stderr", stderr);
        reject(error);
      }, timeoutMs);
    }

    child.stdout?.on("data", (chunk) => {
      if (stdoutTruncated) return;
      const next = appendOutput(stdout, stdoutBytes, chunk);
      stdout = next.text;
      stdoutBytes = next.bytes;
      stdoutTruncated = next.truncated;
    });
    child.stderr?.on("data", (chunk) => {
      if (stderrTruncated) return;
      const next = appendOutput(stderr, stderrBytes, chunk);
      stderr = next.text;
      stderrBytes = next.bytes;
      stderrTruncated = next.truncated;
    });

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearProcessTimeout();
      reject(error);
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearProcessTimeout();
      resolve({
        code: typeof code === "number" && Number.isInteger(code) ? code : -1,
        stdout,
        stderr,
      });
    });
  });
}

export function normalizeOriginExePath(inputPath: unknown): string | null {
  if (typeof inputPath !== "string") return null;
  const normalized = inputPath.trim();
  return normalized || null;
}

export function normalizeOriginPathKey(inputPath: unknown): string | null {
  const normalized = normalizeOriginExePath(inputPath);
  return normalized ? normalized.toLowerCase() : null;
}

export function assertOriginExePath(originExePath: unknown): string {
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

export function parseJsonFile(filePath: unknown): JsonObject | null {
  if (typeof filePath !== "string" || !filePath || !fs.existsSync(filePath)) {
    return null;
  }
  try {
    const raw = String(fs.readFileSync(filePath, "utf8") || "").trim();
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as JsonObject
      : null;
  } catch {
    return null;
  }
}

