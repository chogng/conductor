import fs from "node:fs";
import path from "node:path";
import {
  normalizeOriginExePath,
  normalizeOriginPathKey,
  assertOriginExePath,
  runProcess,
} from "./core.js";

type OriginDetectSource = "env" | "registry" | "directory";
const REGISTRY_QUERY_TIMEOUT_MS = 5000;
const REGISTRY_QUERY_MAX_OUTPUT_BYTES = 1024 * 1024;

export type OriginDetectionProbe = {
  source: OriginDetectSource;
  candidates: number;
  uniqueCandidates: number;
  matched: boolean;
};

export type OriginDetectionResult = {
  path: string | null;
  source: OriginDetectSource | null;
  probes: OriginDetectionProbe[];
};

function expandWindowsEnvVars(input: unknown): string {
  const raw = String(input || "");
  return raw.replace(/%([^%]+)%/g, (_match, name) => {
    const key = String(name || "").trim();
    return process.env[key] ?? `%${key}%`;
  });
}

function collectCandidatePathsFromString(input: unknown): string[] {
  const raw = String(input || "").trim();
  if (!raw) return [];

  const candidates: string[] = [];
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
    candidates.push(path.join(normalized, "Origin_32.exe"));
  }

  return candidates;
}

async function collectRegistryOriginCandidates(): Promise<string[]> {
  const appPathExecutables = ["Origin.exe", "Origin64.exe", "Origin_32.exe"];
  const appPathRoots = [
    "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths",
    "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths",
    "HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\App Paths",
  ];

  const regQueries: string[][] = [
    ...appPathRoots.flatMap((root) =>
      appPathExecutables.map((name) => ["query", `${root}\\${name}`, "/ve"]),
    ),
    ["query", "HKCU\\SOFTWARE\\OriginLab", "/s"],
    ["query", "HKLM\\SOFTWARE\\OriginLab", "/s"],
    ["query", "HKCU\\SOFTWARE\\WOW6432Node\\OriginLab", "/s"],
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

  const outputs = await Promise.all(
    regQueries.map(async (args) => {
      try {
        const result = await runProcess("reg.exe", args, {
          windowsHide: true,
          timeoutMs: REGISTRY_QUERY_TIMEOUT_MS,
          maxOutputBytes: REGISTRY_QUERY_MAX_OUTPUT_BYTES,
        });
        return result.code === 0 ? String(result.stdout || "") : "";
      } catch {
        // Ignore registry read failures; continue probing other sources.
        return "";
      }
    }),
  );

  const candidates: string[] = [];
  for (const output of outputs) {
    if (!output) continue;
    const lines = output.split(/\r?\n/);
    for (const line of lines) {
      const match = line.match(/^\s*([^\s].*?)\s+REG_[A-Z0-9_]+\s+(.+)\s*$/i);
      if (!match) continue;
      const value = String(match[2] || "").trim();
      if (!value) continue;
      candidates.push(...collectCandidatePathsFromString(value));
    }
  }

  return candidates;
}

function collectDirectoryOriginCandidates(): string[] {
  const roots = [
    process.env.ProgramFiles,
    process.env["ProgramFiles(x86)"],
    process.env.LocalAppData,
  ]
    .filter((p) => typeof p === "string" && p.trim())
    .map((p) => String(p).trim());

  const candidates: string[] = [];
  const seenDirs = new Set<string>();
  for (const root of roots) {
    const baseDir = path.join(root, "OriginLab");
    if (!fs.existsSync(baseDir) || seenDirs.has(baseDir.toLowerCase())) continue;
    seenDirs.add(baseDir.toLowerCase());

    const queue: Array<{ dir: string; depth: number }> = [{ dir: baseDir, depth: 0 }];
    while (queue.length) {
      const current = queue.shift();
      if (!current) continue;
      const { dir, depth } = current;
      if (depth > 2) continue;

      let entries: fs.Dirent[] = [];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isFile()) {
          if (/^origin(?:64|_32)?\.exe$/i.test(entry.name)) {
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

function pickFirstValidOriginExePath(candidates: string[]): string | null {
  const seen = new Set<string>();
  for (const raw of candidates) {
    const candidate = normalizeOriginExePath(raw);
    const key = normalizeOriginPathKey(raw);
    if (!candidate || !key) continue;
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

function countUniqueCandidates(candidates: string[]): number {
  const seen = new Set<string>();
  for (const raw of candidates) {
    const key = normalizeOriginPathKey(raw);
    if (!key) continue;
    seen.add(key);
  }
  return seen.size;
}

function hasMatchedCandidate(candidates: string[], matchedPath: string): boolean {
  const matchedKey = normalizeOriginPathKey(matchedPath);
  if (!matchedKey) return false;
  return candidates.some((candidate) => {
    const key = normalizeOriginPathKey(candidate);
    return key === matchedKey;
  });
}

export async function detectOriginExecutablePathDetailed(): Promise<OriginDetectionResult> {
  if (process.platform !== "win32") {
    return {
      path: null,
      source: null,
      probes: [],
    };
  }

  const envCandidates = collectCandidatePathsFromString(process.env.ORIGIN_EXE_PATH);
  const [registryCandidates, directoryCandidates] = await Promise.all([
    collectRegistryOriginCandidates(),
    Promise.resolve().then(() => collectDirectoryOriginCandidates()),
  ]);

  const allCandidates: string[] = [
    ...envCandidates,
    ...registryCandidates,
    ...directoryCandidates,
  ];
  const path = pickFirstValidOriginExePath(allCandidates);

  const source: OriginDetectSource | null = path
    ? hasMatchedCandidate(envCandidates, path)
      ? "env"
      : hasMatchedCandidate(registryCandidates, path)
        ? "registry"
        : hasMatchedCandidate(directoryCandidates, path)
          ? "directory"
          : null
    : null;

  const probes: OriginDetectionProbe[] = [
    {
      source: "env",
      candidates: envCandidates.length,
      uniqueCandidates: countUniqueCandidates(envCandidates),
      matched: Boolean(path && hasMatchedCandidate(envCandidates, path)),
    },
    {
      source: "registry",
      candidates: registryCandidates.length,
      uniqueCandidates: countUniqueCandidates(registryCandidates),
      matched: Boolean(path && hasMatchedCandidate(registryCandidates, path)),
    },
    {
      source: "directory",
      candidates: directoryCandidates.length,
      uniqueCandidates: countUniqueCandidates(directoryCandidates),
      matched: Boolean(path && hasMatchedCandidate(directoryCandidates, path)),
    },
  ];

  return {
    path,
    source,
    probes,
  };
}


