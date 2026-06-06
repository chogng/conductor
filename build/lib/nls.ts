#!/usr/bin/env node
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

type Messages = Record<string, string>;

type LocalizeEntry = {
  readonly key: string;
  readonly message: string;
  readonly filePath: string;
  readonly line: number;
};

const root = process.cwd();
const srcDir = path.join(root, "src");
const nlsDir = path.join(root, "build", "nls");
const enPath = path.join(nlsDir, "en.json");
const zhPath = path.join(nlsDir, "zh.json");

const readMessages = (filePath: string): Messages =>
  JSON.parse(readFileSync(filePath, "utf8")) as Messages;

const writeMessages = (filePath: string, messages: Messages): void => {
  writeFileSync(filePath, JSON.stringify(messages, null, 2) + "\n", "utf8");
};

const collectTypeScriptFiles = (dirPath: string): string[] => {
  const result: string[] = [];

  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) {
      continue;
    }

    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      result.push(...collectTypeScriptFiles(entryPath));
      continue;
    }

    if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) {
      result.push(entryPath);
    }
  }

  return result.sort();
};

const getStaticString = (node: ts.Expression): string | undefined => {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }

  return undefined;
};

const collectLocalizeEntries = (): LocalizeEntry[] => {
  const entries: LocalizeEntry[] = [];

  for (const filePath of collectTypeScriptFiles(srcDir)) {
    const sourceText = readFileSync(filePath, "utf8");
    const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);

    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node)
        && ts.isIdentifier(node.expression)
        && node.expression.text === "localize"
        && node.arguments.length >= 2
      ) {
        const key = getStaticString(node.arguments[0]);
        const message = getStaticString(node.arguments[1]);

        if (key !== undefined && message !== undefined) {
          const { line } = sourceFile.getLineAndCharacterOfPosition(node.arguments[0].getStart(sourceFile));
          entries.push({
            key,
            message,
            filePath,
            line: line + 1,
          });
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }

  return entries;
};

const buildEnglishMessages = (entries: readonly LocalizeEntry[]): Messages => {
  const messages = new Map<string, string>();
  const conflicts: string[] = [];

  for (const entry of entries) {
    const existing = messages.get(entry.key);
    if (existing !== undefined && existing !== entry.message) {
      conflicts.push(
        `${entry.key} (${path.relative(root, entry.filePath)}:${entry.line})\n`
        + `  existing: ${JSON.stringify(existing)}\n`
        + `  incoming: ${JSON.stringify(entry.message)}`,
      );
      continue;
    }

    messages.set(entry.key, entry.message);
  }

  if (conflicts.length) {
    console.error("[nls] Conflicting English source strings:");
    for (const conflict of conflicts) {
      console.error(conflict);
    }
    process.exit(1);
  }

  return Object.fromEntries([...messages.entries()].sort(([left], [right]) => left.localeCompare(right)));
};

const diffKeys = (left: Messages, right: Messages): string[] =>
  Object.keys(left).filter(key => !(key in right)).sort();

const entries = collectLocalizeEntries();
const generatedEn = buildEnglishMessages(entries);
const previousEn = readMessages(enPath);
const zh = readMessages(zhPath);

const nextEnText = JSON.stringify(generatedEn, null, 2) + "\n";
const previousEnText = JSON.stringify(previousEn, null, 2) + "\n";

if (nextEnText !== previousEnText) {
  writeMessages(enPath, generatedEn);
  console.log(`[nls] Synced build/nls/en.json from ${entries.length} localize() call(s).`);
}

const missingInZh = diffKeys(generatedEn, zh);
const extraInZh = diffKeys(zh, generatedEn);

if (missingInZh.length) {
  console.warn(`[nls] Warning: missing zh keys: ${missingInZh.join(", ")}`);
}
if (extraInZh.length) {
  console.warn(`[nls] Warning: extra zh keys: ${extraInZh.join(", ")}`);
}

console.log(`[nls] Verified ${Object.keys(generatedEn).length} built-in messages.`);
