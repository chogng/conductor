import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import Mocha from "mocha";

export const workspace = path.resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const outRoot = path.join(workspace, "out", "test");
const outSrcRoot = path.join(outRoot, "src");

let prepared = false;

const toImportPath = (fromFile, targetFile) => {
  const relative = path.relative(path.dirname(fromFile), targetFile).replace(/\\/g, "/");
  return relative.startsWith(".") ? relative : `./${relative}`;
};

const resolveCompiledImport = (fromFile, specifier) => {
  if (specifier.endsWith(".css")) {
    return null;
  }

  if (specifier.startsWith(".")) {
    const targetPath = path.resolve(path.dirname(fromFile), specifier);
    if (existsSync(`${targetPath}.js`)) {
      return `${specifier}.js`;
    }
    if (existsSync(path.join(targetPath, "index.js"))) {
      return `${specifier.replace(/\/$/, "")}/index.js`;
    }
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
    /(from\s+["'])([^"']+)(["'])/g,
    (match, prefix, specifier, suffix) => {
      const resolved = resolveCompiledImport(filePath, specifier);
      return resolved ? `${prefix}${resolved}${suffix}` : match;
    },
  );
  next = next.replace(
    /(import\s*\(\s*["'])([^"']+)(["']\s*\))/g,
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

const isRunnableUnitTest = (filePath) => {
  if (!filePath.endsWith(".test.js")) {
    return false;
  }
  const relative = path.relative(outSrcRoot, filePath).replace(/\\/g, "/");
  const sourcePath = path.join(workspace, "src", relative.replace(/\.js$/, ".ts"));
  if (!existsSync(sourcePath)) {
    return false;
  }
  if (relative.startsWith("cs/base/test/browser/")) {
    return false;
  }
  if (relative.startsWith("cs/code/electron-main/") || relative.startsWith("cs/code/electron-utility/")) {
    return false;
  }

  return true;
};

export const collectCompiledUnitTests = (directory = outSrcRoot) => {
  const tests = [];
  visit(directory, (filePath) => {
    if (isRunnableUnitTest(filePath)) {
      tests.push(filePath);
    }
  });
  return tests.sort();
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

export const prepareCompiledUnitTests = async () => {
  if (prepared) {
    return;
  }
  if (!existsSync(outSrcRoot)) {
    throw new Error(`Missing compiled test output: ${outSrcRoot}`);
  }

  visit(outSrcRoot, (filePath) => {
    if (filePath.endsWith(".js") || filePath.endsWith(".mjs")) {
      rewriteImports(filePath);
    }
  });
  rewriteNlsForTests();

  const nlsSetup = createNlsTestSetup();
  await import(pathToFileURL(nlsSetup).href);
  prepared = true;
};

const mapSourcePathToCompiledPath = (sourcePath) => {
  const absoluteSourcePath = path.resolve(workspace, sourcePath);
  const relativeToWorkspace = path.relative(workspace, absoluteSourcePath);
  if (relativeToWorkspace.startsWith("..")) {
    throw new Error(`Test path must be inside the workspace: ${sourcePath}`);
  }
  return path.join(outRoot, relativeToWorkspace.replace(/\.ts$/, ".js"));
};

const isInsidePath = (parentPath, childPath) => {
  const relative = path.relative(parentPath, childPath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
};

const resolveCompiledTestPath = (inputPath) => {
  const absoluteInputPath = path.resolve(workspace, inputPath);
  const compiledPath = isInsidePath(outRoot, absoluteInputPath)
    ? absoluteInputPath
    : mapSourcePathToCompiledPath(inputPath);
  if (!existsSync(compiledPath)) {
    throw new Error(`Compiled test file does not exist: ${compiledPath}`);
  }
  if (!isRunnableUnitTest(compiledPath)) {
    throw new Error(`Not a runnable unit test: ${inputPath}`);
  }
  return compiledPath;
};

export const resolveCompiledUnitTests = (inputPaths) => {
  if (!inputPaths.length) {
    return collectCompiledUnitTests();
  }

  const tests = [];
  for (const inputPath of inputPaths) {
    const absoluteInputPath = path.resolve(workspace, inputPath);
    if (existsSync(absoluteInputPath) && statSync(absoluteInputPath).isDirectory()) {
      const compiledDirectory = isInsidePath(outRoot, absoluteInputPath)
        ? absoluteInputPath
        : mapSourcePathToCompiledPath(inputPath).replace(/\.js$/, "");
      tests.push(...collectCompiledUnitTests(compiledDirectory));
      continue;
    }
    tests.push(resolveCompiledTestPath(inputPath));
  }

  return [...new Set(tests)].sort();
};

export const runCompiledUnitTests = async (tests) => {
  const mocha = new Mocha({
    ui: "tdd",
  });

  for (const file of tests) {
    mocha.addFile(file);
  }

  await mocha.loadFilesAsync();

  return new Promise((resolve) => {
    mocha.run((failures) => {
      resolve(failures);
    });
  });
};
