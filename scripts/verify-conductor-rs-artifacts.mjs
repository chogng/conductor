import fs from "node:fs";
import path from "node:path";

const artifactPathPrefixes = ["resources/bin/"];

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
const trackedArtifacts = artifactPathPrefixes.filter((artifactPathPrefix) =>
  indexBytes.includes(Buffer.from(artifactPathPrefix, "utf8"))
);

if (trackedArtifacts.length) {
  console.error(
    [
      "conductor-rs build artifacts must stay out of git.",
      "Run `git rm --cached -- resources/bin/conductor-rs resources/bin/conductor-rs.exe` and rebuild with `npm run build:conductor-rs` before packaging.",
      "",
      "Tracked artifacts:",
      ...trackedArtifacts.map((artifact) => `- ${artifact}`),
    ].join("\n"),
  );
  process.exit(1);
}

console.log("[verify-conductor-rs-artifacts] no tracked conductor-rs artifacts");
