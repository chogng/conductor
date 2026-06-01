#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";

type Messages = Record<string, string>;

const root = process.cwd();
const nlsDir = path.join(root, "build", "nls");

const readMessages = (language: string): Messages => {
  const filePath = path.join(nlsDir, `${language}.json`);
  return JSON.parse(readFileSync(filePath, "utf8")) as Messages;
};

const diffKeys = (left: Messages, right: Messages): string[] =>
  Object.keys(left).filter(key => !(key in right)).sort();

const en = readMessages("en");
const zh = readMessages("zh");

const missingInZh = diffKeys(en, zh);
const missingInEn = diffKeys(zh, en);

if (missingInZh.length || missingInEn.length) {
  if (missingInZh.length) {
    console.error(`[nls] Missing zh keys: ${missingInZh.join(", ")}`);
  }
  if (missingInEn.length) {
    console.error(`[nls] Missing en keys: ${missingInEn.join(", ")}`);
  }
  process.exit(1);
}

console.log(`[nls] Verified ${Object.keys(en).length} built-in messages.`);
