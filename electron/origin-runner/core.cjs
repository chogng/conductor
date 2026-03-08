const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

function ensureDir(dirPath) {
  if (!dirPath || typeof dirPath !== "string") {
    throw new Error("Invalid directory path.");
  }
  fs.mkdirSync(dirPath, { recursive: true });
}

function sanitizeFileName(name) {
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

function getPowerShellExePath() {
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

function runProcess(exePath, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(exePath, args, {
      cwd: options.cwd,
      windowsHide: options.windowsHide !== false,
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

async function expandArchive(zipPath, destinationPath) {
  const psCommand = `Expand-Archive -LiteralPath '${escapePsSingleQuoted(
    zipPath,
  )}' -DestinationPath '${escapePsSingleQuoted(destinationPath)}' -Force`;

  const result = await runProcess(
    getPowerShellExePath(),
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", psCommand],
    { windowsHide: true },
  );

  if (result.code !== 0) {
    throw new Error(
      `Failed to extract ZIP (${result.code}): ${
        result.stderr || result.stdout || "unknown error"
      }`,
    );
  }
}

function normalizeZipBuffer(bytes) {
  if (Buffer.isBuffer(bytes)) return bytes;
  if (bytes instanceof ArrayBuffer) return Buffer.from(bytes);
  if (ArrayBuffer.isView(bytes)) {
    return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  if (Array.isArray(bytes)) return Buffer.from(bytes);
  throw new Error("Invalid ZIP payload bytes.");
}

function normalizeOriginExePath(inputPath) {
  if (typeof inputPath !== "string") return null;
  const normalized = inputPath.trim();
  return normalized || null;
}

function assertOriginExePath(originExePath) {
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

function assertDirectoryPath(dirPath, label = "Directory path") {
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

function parseJsonFile(filePath) {
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

module.exports = {
  ensureDir,
  sanitizeFileName,
  getPowerShellExePath,
  runProcess,
  expandArchive,
  normalizeZipBuffer,
  normalizeOriginExePath,
  assertOriginExePath,
  assertDirectoryPath,
  parseJsonFile,
};
