import {
  jsonFileExists,
  readJsonFile,
  writeJsonFile,
} from "./jsonFileStorage.js";

type JsonStorageDocumentOptions<T> = {
  getPath: () => string;
  getDefaultValue: () => T;
  readNormalize: (raw: unknown) => T;
  writeNormalize?: (raw: unknown) => T;
  clone: (value: T) => T;
};

export function createJsonStorageDocument<T>({
  getPath,
  getDefaultValue,
  readNormalize,
  writeNormalize = readNormalize,
  clone,
}: JsonStorageDocumentOptions<T>) {
  let cache: T | null = null;
  let cachePath: string | null = null;

  const clear = (): void => {
    cache = null;
    cachePath = null;
  };

  const readCached = (documentPath: string): T | null => {
    if (cache && cachePath === documentPath) {
      return clone(cache);
    }

    return null;
  };

  const readDefault = (options: { createIfMissing?: boolean } = {}): T => {
    const documentPath = getPath();
    const cached = readCached(documentPath);
    if (cached) return cached;

    if (!jsonFileExists(documentPath)) {
      const defaults = getDefaultValue();
      if (options.createIfMissing) {
        writeJsonFile(documentPath, writeNormalize(defaults));
      }
      cache = defaults;
      cachePath = documentPath;
      return clone(defaults);
    }

    const raw = readJsonFile(documentPath);
    if (!raw) {
      cache = getDefaultValue();
      cachePath = documentPath;
      return clone(cache);
    }

    cache = readNormalize(raw);
    cachePath = documentPath;
    return clone(cache);
  };

  const readOrCreateDefault = (): T => readDefault({ createIfMissing: true });

  const tryRead = (): T | null => {
    const documentPath = getPath();
    const cached = readCached(documentPath);
    if (cached) return cached;

    const raw = readJsonFile(documentPath);
    if (!raw) return null;

    cache = readNormalize(raw);
    cachePath = documentPath;
    return clone(cache);
  };

  const write = (nextValue: unknown): T => {
    const documentPath = getPath();
    const normalized = writeNormalize(nextValue);
    writeJsonFile(documentPath, normalized);
    cache = normalized;
    cachePath = documentPath;
    return clone(normalized);
  };

  return {
    clear,
    readDefault,
    readOrCreateDefault,
    tryRead,
    write,
  };
}
