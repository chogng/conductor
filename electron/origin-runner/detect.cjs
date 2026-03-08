const fs = require("node:fs");
const path = require("node:path");
const {
  normalizeOriginExePath,
  assertOriginExePath,
  runProcess,
} = require("./core.cjs");

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

module.exports = {
  detectOriginExecutablePath,
};
