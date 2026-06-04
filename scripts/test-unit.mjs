import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const workspace = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const outRoot = path.join(workspace, "out-test");
const outSrcRoot = path.join(outRoot, "src");

const sourceTests = [
  "src/cs/base/common/test/uri.test.mjs",
  "src/cs/base/common/test/path.test.mjs",
  "src/cs/workbench/contrib/table/browser/tableService.test.mjs",
  "src/cs/workbench/contrib/table/browser/rows/rowChunk.test.mjs",
  "src/cs/workbench/contrib/table/browser/rows/selectionNavigation.test.mjs",
  "src/cs/workbench/contrib/table/browser/rows/rustCells.test.mjs",
  "src/cs/workbench/contrib/template/test/autoTemplate.test.mjs",
  "src/cs/workbench/contrib/template/test/autoTemplatePlan.test.mjs",
  "src/cs/workbench/contrib/template/test/fileNameMatching.test.mjs",
  "src/cs/workbench/contrib/template/test/templateController.test.mjs",
  "src/cs/workbench/contrib/template/test/templateManagerUtils.test.mjs",
  "src/cs/workbench/contrib/template/test/templateRecords.test.mjs",
  "src/cs/workbench/contrib/template/test/templateSelection.test.mjs",
  "src/cs/workbench/contrib/template/test/extractionErrors.test.mjs",
  "src/cs/workbench/contrib/thumbnail/browser/thumbnailView.test.mjs",
  "src/cs/workbench/browser/layout.test.mjs",
  "src/cs/workbench/services/analysisFile/test/importFileAssessment.test.mjs",
  "src/cs/workbench/services/analysisFile/test/fileAssessment.test.mjs",
  "src/cs/workbench/contrib/plot/test/common/units.test.mjs",
  "src/cs/workbench/contrib/plot/test/browser/plotModel.test.mjs",
  "src/cs/workbench/contrib/plot/test/browser/plotSeriesModel.test.mjs",
  "src/cs/workbench/contrib/plot/test/browser/mainPlotModel.test.mjs",
  "src/cs/workbench/contrib/diagnostics/common/metrics.test.mjs",
  "src/cs/workbench/contrib/diagnostics/common/analysisMath.test.mjs",
  "src/cs/workbench/contrib/diagnostics/common/vth.test.mjs",
  "src/cs/workbench/contrib/parameters/browser/parametersModel.test.mjs",
  "src/cs/workbench/contrib/parameters/browser/parametersController.test.mjs",
  "src/cs/workbench/contrib/parameters/browser/rcAnalysisModel.test.mjs",
  "src/cs/workbench/contrib/plot/test/browser/canvasPlot.test.mjs",
  "src/cs/workbench/contrib/export/browser/exportModel.test.mjs",
  "src/cs/workbench/contrib/export/browser/export.test.mjs",
];

const tests = sourceTests.map((test) => path.join("out-test", test));

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
const result = spawnSync(process.execPath, [
  "--import",
  pathToFileURL(nlsSetup).href,
  "--test",
  "--test-isolation=none",
  ...tests,
], {
  stdio: "inherit",
});

process.exit(result.status ?? 1);
