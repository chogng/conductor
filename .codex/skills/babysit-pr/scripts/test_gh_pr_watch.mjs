import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";

const script = await readFile(new URL("./gh_pr_watch.mjs", import.meta.url), "utf8");
assert.match(script, /"pr"/);
assert.match(script, /"view"/);
assert.match(script, /"checks"/);
console.log("ok");
