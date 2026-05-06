import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";

const script = await readFile(new URL("./collect_issue_digest.mjs", import.meta.url), "utf8");
assert.match(script, /"issue"/);
assert.match(script, /"list"/);
assert.match(script, /repo:chogng\/conductor/);
console.log("ok");
