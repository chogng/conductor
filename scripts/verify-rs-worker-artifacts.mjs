import fs from "node:fs";
import path from "node:path";

const artifactPathPrefix = "workers/rs/";

const resolveGitDir = () => {
  const gitPath = path.join(process.cwd(), ".git");
  const stat = fs.statSync(gitPath);
  if (stat.isDirectory()) return gitPath;

  const gitFile = fs.readFileSync(gitPath, "utf8").trim();
  const match = /^gitdir:\s*(.+)$/i.exec(gitFile);
  if (!match) throw new Error(`Unable to resolve git directory from ${gitPath}`);
  const gitDir = match[1];
  return path.isAbsolute(gitDir) ? gitDir : path.resolve(process.cwd(), gitDir);
};

const indexPath = path.join(resolveGitDir(), "index");
const indexBytes = fs.existsSync(indexPath) ? fs.readFileSync(indexPath) : Buffer.alloc(0);
const trackedArtifacts = indexBytes.includes(Buffer.from(artifactPathPrefix, "utf8"))
  ? [artifactPathPrefix]
  : [];

if (trackedArtifacts.length) {
  console.error(
    [
      "rs-worker build artifacts must stay out of git.",
      "Run `git rm --cached -- workers/rs/rs-worker workers/rs/rs-worker.exe` and rebuild with `npm run build:rs-worker` before packaging.",
      "",
      "Tracked artifacts:",
      ...trackedArtifacts.map((artifact) => `- ${artifact}`),
    ].join("\n"),
  );
  process.exit(1);
}

console.log("[verify-rs-worker-artifacts] no tracked rs-worker artifacts");
