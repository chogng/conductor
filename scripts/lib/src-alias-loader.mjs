import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ROOT_URL = pathToFileURL(`${ROOT}${path.sep}`).href;

const resolveSourceSpecifier = (specifier) => {
  if (specifier !== "src" && !specifier.startsWith("src/")) {
    return null;
  }

  const basePath = path.join(ROOT, specifier);
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    `${basePath}.js`,
    path.join(basePath, "index.ts"),
    path.join(basePath, "index.tsx"),
    path.join(basePath, "index.js"),
  ];
  const match = candidates.find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
  return match ? pathToFileURL(match).href : null;
};

export async function resolve(specifier, context, nextResolve) {
  const sourceUrl = resolveSourceSpecifier(specifier);
  if (sourceUrl) {
    return {
      shortCircuit: true,
      url: sourceUrl,
    };
  }

  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.startsWith(ROOT_URL) && url.endsWith(".json")) {
    const source = fs.readFileSync(fileURLToPath(url), "utf8");
    return {
      format: "module",
      shortCircuit: true,
      source: `export default ${source};`,
    };
  }

  return nextLoad(url, context);
}
