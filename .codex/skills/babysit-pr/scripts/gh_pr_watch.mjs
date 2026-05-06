import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const args = process.argv.slice(2);
const prIndex = args.indexOf("--pr");
const prValue = prIndex >= 0 ? args[prIndex + 1] : "auto";
const once = args.includes("--once");

async function runGh(argsList) {
  const { stdout } = await execFileAsync("gh", argsList, { maxBuffer: 10 * 1024 * 1024 });
  return stdout.trim();
}

async function detectPrNumber() {
  if (prValue !== "auto") return prValue;
  const branch = await runGh(["pr", "view", "--json", "number", "--jq", ".number"]);
  return branch || null;
}

async function main() {
  const pr = await detectPrNumber();
  if (!pr) {
    console.log(JSON.stringify({ ok: false, error: "No pull request detected." }, null, 2));
    process.exitCode = 1;
    return;
  }

  const prJson = await runGh([
    "pr",
    "view",
    pr,
    "--json",
    "number,title,state,headRefName,mergeable,reviewDecision,author,url",
  ]);
  const checksJson = await runGh([
    "pr",
    "checks",
    pr,
    "--json",
    "name,state,conclusion,workflowName,event,url",
  ]);

  const output = {
    ok: true,
    pr: JSON.parse(prJson),
    checks: JSON.parse(checksJson),
    mode: once ? "once" : "watch",
  };
  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exitCode = 1;
});
