import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const args = process.argv.slice(2);

function readArg(flag, fallback = null) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] ?? fallback : fallback;
}

const labels = readArg("--labels", "");
const windowHours = Number(readArg("--window-hours", "24"));
const allLabels = args.includes("--all-labels");

async function runGh(argsList) {
  const { stdout } = await execFileAsync("gh", argsList, { maxBuffer: 10 * 1024 * 1024 });
  return stdout.trim();
}

function summarize(items) {
  if (!items.length) return ["No major issues reported by users."];
  const counts = new Map();
  for (const issue of items) {
    const key = issue.labels?.[0] || "general";
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([label, count]) => `${count} issue(s) in ${label}`);
}

async function main() {
  const queryParts = ["repo:chogng/conductor", "is:issue", "(label:bug OR label:enhancement)"];
  if (!allLabels && labels) {
    for (const label of labels.split(/\s+/).filter(Boolean)) {
      queryParts.push(`label:${label}`);
    }
  }
  const json = await runGh([
    "issue",
    "list",
    "--limit",
    "50",
    "--state",
    "open",
    "--search",
    queryParts.join(" "),
    "--json",
    "number,title,url,labels,createdAt,updatedAt",
  ]);
  const issues = JSON.parse(json);
  const summary = summarize(issues);
  console.log(JSON.stringify({
    ok: true,
    windowHours,
    labels: allLabels ? "all" : labels,
    issues,
    summary,
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exitCode = 1;
});
