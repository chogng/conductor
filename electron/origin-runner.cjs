const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
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

function expandWindowsEnvVars(input) {
  const raw = String(input || "");
  return raw.replace(/%([^%]+)%/g, (_match, name) => {
    const key = String(name || "").trim();
    return process.env[key] ?? `%${key}%`;
  });
}

function collectCandidatePathsFromString(input) {
  const raw = String(input || "").trim();
  if (!raw) return [];

  const candidates = [];
  const exeMatches = raw.match(/[A-Za-z]:\\[^"\r\n]*?\.exe/gi) || [];
  for (const match of exeMatches) {
    const expanded = expandWindowsEnvVars(match).trim();
    if (expanded) candidates.push(expanded);
  }

  const normalized = expandWindowsEnvVars(raw).trim().replace(/^"(.*)"$/, "$1");
  if (/\.exe$/i.test(normalized)) {
    candidates.push(normalized);
  } else if (path.win32.isAbsolute(normalized)) {
    candidates.push(path.join(normalized, "Origin.exe"));
    candidates.push(path.join(normalized, "Origin64.exe"));
  }

  return candidates;
}

async function collectRegistryOriginCandidates() {
  const regQueries = [
    ["query", "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\Origin.exe", "/ve"],
    ["query", "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\Origin.exe", "/ve"],
    ["query", "HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\App Paths\\Origin.exe", "/ve"],
    ["query", "HKCU\\SOFTWARE\\OriginLab", "/s"],
    ["query", "HKLM\\SOFTWARE\\OriginLab", "/s"],
    ["query", "HKLM\\SOFTWARE\\WOW6432Node\\OriginLab", "/s"],
    [
      "query",
      "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
      "/s",
      "/f",
      "Origin",
      "/d",
    ],
    [
      "query",
      "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
      "/s",
      "/f",
      "Origin",
      "/d",
    ],
    [
      "query",
      "HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
      "/s",
      "/f",
      "Origin",
      "/d",
    ],
  ];

  const candidates = [];
  for (const args of regQueries) {
    try {
      const result = await runProcess("reg.exe", args, { windowsHide: true });
      if (result.code !== 0) continue;
      const lines = String(result.stdout || "").split(/\r?\n/);
      for (const line of lines) {
        const match = line.match(/^\s*([^\s].*?)\s+REG_[A-Z0-9_]+\s+(.+)\s*$/i);
        if (!match) continue;
        const value = String(match[2] || "").trim();
        if (!value) continue;
        candidates.push(...collectCandidatePathsFromString(value));
      }
    } catch {
      // Ignore registry read failures; continue probing other sources.
    }
  }

  return candidates;
}

function collectDirectoryOriginCandidates() {
  const roots = [
    process.env.ProgramFiles,
    process.env["ProgramFiles(x86)"],
    process.env.LocalAppData,
  ]
    .filter((p) => typeof p === "string" && p.trim())
    .map((p) => String(p).trim());

  const candidates = [];
  const seenDirs = new Set();
  for (const root of roots) {
    const baseDir = path.join(root, "OriginLab");
    if (!fs.existsSync(baseDir) || seenDirs.has(baseDir.toLowerCase())) continue;
    seenDirs.add(baseDir.toLowerCase());

    const queue = [{ dir: baseDir, depth: 0 }];
    while (queue.length) {
      const { dir, depth } = queue.shift();
      if (depth > 2) continue;

      let entries = [];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isFile()) {
          if (/^origin(64)?\.exe$/i.test(entry.name)) {
            candidates.push(fullPath);
          }
          continue;
        }
        if (entry.isDirectory()) {
          queue.push({ dir: fullPath, depth: depth + 1 });
        }
      }
    }
  }

  return candidates;
}

function pickFirstValidOriginExePath(candidates) {
  const seen = new Set();
  for (const raw of candidates) {
    const candidate = normalizeOriginExePath(raw);
    if (!candidate) continue;
    const key = candidate.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      return assertOriginExePath(candidate);
    } catch {
      // Skip invalid path candidates.
    }
  }
  return null;
}

async function detectOriginExecutablePath() {
  if (process.platform !== "win32") return null;

  const candidates = [];
  candidates.push(...collectCandidatePathsFromString(process.env.ORIGIN_EXE_PATH));
  candidates.push(...(await collectRegistryOriginCandidates()));
  candidates.push(...collectDirectoryOriginCandidates());

  return pickFirstValidOriginExePath(candidates);
}

function createJobPaths(zipName) {
  const rootDir = path.join(os.tmpdir(), "device-analysis-origin", "jobs");
  ensureDir(rootDir);

  const jobId = `${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  const jobDir = path.join(rootDir, jobId);
  const extractDir = path.join(jobDir, "extract");
  const workDir = path.join(jobDir, ".ob");

  ensureDir(jobDir);
  ensureDir(extractDir);
  ensureDir(workDir);

  const safeZipName = sanitizeFileName(zipName);
  const inputZipPath = path.join(jobDir, safeZipName);

  return {
    jobDir,
    extractDir,
    workDir,
    inputZipPath,
  };
}

async function runOriginZipJob({
  zipName,
  bytes,
  originExePath,
  workerScriptPath,
}) {
  const normalizedOriginExePath = assertOriginExePath(originExePath);

  if (!workerScriptPath || !fs.existsSync(workerScriptPath)) {
    throw new Error(`Origin worker script not found: ${workerScriptPath}`);
  }

  const zipBuffer = normalizeZipBuffer(bytes);
  if (!zipBuffer.length) {
    throw new Error("ZIP payload is empty.");
  }

  const { jobDir, extractDir, workDir, inputZipPath } = createJobPaths(zipName);
  fs.writeFileSync(inputZipPath, zipBuffer);

  await expandArchive(inputZipPath, extractDir);

  const workerResult = await runProcess(
    getPowerShellExePath(),
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      workerScriptPath,
      "-WorkDir",
      workDir,
      "-ExtractDir",
      extractDir,
      "-OriginExe",
      normalizedOriginExePath,
    ],
    { windowsHide: true },
  );

  const logPath = path.join(workDir, "originbridge.log");
  const errorPath = path.join(workDir, "error.txt");
  const workerError = fs.existsSync(errorPath)
    ? String(fs.readFileSync(errorPath, "utf8") || "").trim()
    : "";

  if (workerResult.code !== 0) {
    const detail =
      workerError ||
      workerResult.stderr ||
      workerResult.stdout ||
      "Origin worker failed.";
    throw new Error(detail);
  }

  return {
    jobDir,
    extractDir,
    workDir,
    logPath,
    errorPath,
  };
}

async function pickOriginExecutable({
  dialog,
  ownerWindow,
  defaultPath,
}) {
  const result = await dialog.showOpenDialog(ownerWindow || undefined, {
    title: "Select Origin executable",
    defaultPath: defaultPath || undefined,
    properties: ["openFile"],
    filters: [
      { name: "Origin executable", extensions: ["exe"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });

  if (result.canceled || !Array.isArray(result.filePaths) || result.filePaths.length === 0) {
    return null;
  }

  return assertOriginExePath(result.filePaths[0]);
}

module.exports = {
  normalizeOriginExePath,
  assertOriginExePath,
  detectOriginExecutablePath,
  pickOriginExecutable,
  runOriginZipJob,
};
