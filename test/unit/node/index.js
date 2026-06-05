import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import Mocha from "mocha";

const workspace = path.resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const outRoot = path.join(workspace, "out-test");
const outSrcRoot = path.join(outRoot, "src");

const toImportPath = (fromFile, targetFile) => {
  const relative = path.relative(path.dirname(fromFile), targetFile).replace(/\\/g, "/");
  return relative.startsWith(".") ? relative : `./${relative}`;
};

const resolveCompiledImport = (fromFile, specifier) => {
  if (specifier.endsWith(".css")) {
    return null;
  }

  if (specifier.startsWith("src/")) {
    return toImportPath(fromFile, path.join(outRoot, `${specifier}.js`));
  }

  if (specifier.startsWith("cs/")) {
    return toImportPath(fromFile, path.join(outSrcRoot, `${specifier}.js`));
  }

  return specifier;
};

const rewriteImports = (filePath) => {
  const source = readFileSync(filePath, "utf8");
  let next = source.replace(/^\s*import\s+["']([^"']+\.css)["'];\s*$/gm, "");
  next = next.replace(
    /(import\s+[^;]+?\s+from\s+["'][^"']+\.json["'])(;)/g,
    "$1 with { type: \"json\" }$2",
  );
  next = next.replace(
    /(from\s+["'])(src\/[^"']+|cs\/[^"']+)(["'])/g,
    (match, prefix, specifier, suffix) => {
      const resolved = resolveCompiledImport(filePath, specifier);
      return resolved ? `${prefix}${resolved}${suffix}` : match;
    },
  );
  next = next.replace(
    /(import\s*\(\s*["'])(src\/[^"']+|cs\/[^"']+)(["']\s*\))/g,
    (match, prefix, specifier, suffix) => {
      const resolved = resolveCompiledImport(filePath, specifier);
      return resolved ? `${prefix}${resolved}${suffix}` : match;
    },
  );

  if (next !== source) {
    writeFileSync(filePath, next, "utf8");
  }
};

const rewriteNlsForTests = () => {
  const nlsPath = path.join(outSrcRoot, "cs/nls.js");
  if (!existsSync(nlsPath)) return;
  const source = readFileSync(nlsPath, "utf8");
  const next = source.replace(
    /export const localize = \(key, defaultMessage, vars\) => \{[\s\S]*?\n\};/,
    [
      "export const localize = (key, defaultMessage, vars) => {",
      "    return vars && Object.keys(vars).length ? `${key}:${JSON.stringify(vars)}` : key;",
      "};",
    ].join("\n"),
  );
  if (next !== source) {
    writeFileSync(nlsPath, next, "utf8");
  }
};

const visit = (directory, visitor) => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      visit(entryPath, visitor);
      continue;
    }
    visitor(entryPath);
  }
};

const collectTests = (directory) => {
  const tests = [];
  visit(directory, (filePath) => {
    if (!filePath.endsWith(".test.js")) {
      return;
    }
    const relative = path.relative(outSrcRoot, filePath).replace(/\\/g, "/");
    const sourcePath = path.join(workspace, "src", relative.replace(/\.js$/, ".ts"));
    if (!existsSync(sourcePath)) {
      return;
    }
    if (relative.startsWith("cs/base/test/browser/")) {
      return;
    }
    if (/(^|\/)(electron-main|electron-utility)(\/|$)/.test(relative)) {
      return;
    }

    tests.push(filePath);
  });
  return tests.sort();
};

const copyAsset = (source, target) => {
  if (!existsSync(source)) return;
  mkdirSync(path.dirname(target), { recursive: true });
  cpSync(source, target);
};

const createNlsTestSetup = () => {
  const setupPath = path.join(outRoot, "test-unit-nls-setup.mjs");
  writeFileSync(setupPath, [
    "globalThis._CONDUCTOR_NLS_LANGUAGE = \"en\";",
    "globalThis._CONDUCTOR_NLS_MESSAGES = new Proxy({}, {",
    "  get: (target, key) => typeof key === \"string\" ? key : undefined,",
    "});",
    "",
  ].join("\n"), "utf8");
  return setupPath;
};

visit(outSrcRoot, (filePath) => {
  if (filePath.endsWith(".js") || filePath.endsWith(".mjs")) {
    rewriteImports(filePath);
  }
});
rewriteNlsForTests();

copyAsset(
  path.join(workspace, "src/cs/workbench/services/analysisFile/browser/assessment.wasm"),
  path.join(outRoot, "src/cs/workbench/services/analysisFile/browser/assessment.wasm"),
);

const nlsSetup = createNlsTestSetup();
const tests = collectTests(outSrcRoot);
// Import via a file:// URL so absolute Windows paths (C:\...) are accepted by
// Node's ESM loader.
await import(pathToFileURL(nlsSetup).href);

const mocha = new Mocha({
  ui: "tdd",
});

for (const file of tests) {
  mocha.addFile(file);
}

await mocha.loadFilesAsync();

const failures = await new Promise((resolve) => {
  mocha.run((failures) => {
    resolve(failures);
  });
});

process.exit(failures ? 1 : 0);
