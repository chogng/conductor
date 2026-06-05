export type FileSystemHandleKind = "directory" | "file";

export type FileSystemPermissionDescriptor = {
  readonly mode?: "read" | "readwrite";
};

export type FileSystemHandleBase = {
  readonly kind: FileSystemHandleKind;
  readonly name: string;
  queryPermission?: (descriptor?: FileSystemPermissionDescriptor) => Promise<PermissionState>;
  requestPermission?: (descriptor?: FileSystemPermissionDescriptor) => Promise<PermissionState>;
  isSameEntry?: (other: FileSystemHandle) => Promise<boolean>;
};

export type FileSystemFileHandle = FileSystemHandleBase & {
  readonly kind: "file";
  getFile(): Promise<File>;
};

export type FileSystemDirectoryHandle = FileSystemHandleBase & {
  readonly kind: "directory";
  [Symbol.asyncIterator]?: () => AsyncIterableIterator<[string, FileSystemHandle]>;
  entries?: () => AsyncIterableIterator<[string, FileSystemHandle]>;
  values?: () => AsyncIterableIterator<FileSystemHandle>;
  getDirectoryHandle(name: string): Promise<FileSystemDirectoryHandle>;
  getFileHandle(name: string): Promise<FileSystemFileHandle>;
};

export type FileSystemHandle = FileSystemDirectoryHandle | FileSystemFileHandle;

export namespace WebFileSystemAccess {
  export function supported(obj: typeof globalThis): boolean {
    return typeof (obj as typeof globalThis & { showDirectoryPicker?: unknown })?.showDirectoryPicker === "function";
  }

  export function isFileSystemHandle(handle: unknown): handle is FileSystemHandle {
    const candidate = handle as FileSystemHandle | undefined;
    if (!candidate) {
      return false;
    }

    return (
      (candidate.kind === "file" || candidate.kind === "directory") &&
      typeof candidate.name === "string"
    );
  }

  export function isFileSystemFileHandle(handle: unknown): handle is FileSystemFileHandle {
    return isFileSystemHandle(handle) && handle.kind === "file";
  }

  export function isFileSystemDirectoryHandle(handle: unknown): handle is FileSystemDirectoryHandle {
    return isFileSystemHandle(handle) && handle.kind === "directory";
  }
}

export type FileSystemObserverRecord = {
  readonly root: FileSystemHandle;
  readonly changedHandle: FileSystemHandle;
  readonly relativePathComponents: readonly string[];
  readonly relativePathMovedFrom?: readonly string[];
  readonly type: "appeared" | "disappeared" | "errored" | "modified" | "moved" | "unknown";
};

export type FileSystemObserver = {
  observe(handle: FileSystemHandle, options?: { recursive: boolean }): Promise<void>;
  unobserve(handle: FileSystemHandle): void;
  disconnect(): void;
};

export namespace WebFileSystemObserver {
  export function supported(obj: typeof globalThis): boolean {
    return typeof (obj as typeof globalThis & { FileSystemObserver?: unknown })?.FileSystemObserver === "function";
  }
}

export type FolderImportUnsupportedReason = "no-picker" | "no-webassembly";

export type FolderImportCapabilities = {
  readonly canPickFolder: boolean;
  readonly hasWebAssembly: boolean;
};

export type FolderImportSupport = {
  readonly reason: FolderImportUnsupportedReason | null;
  readonly supported: boolean;
};

/**
 * Pure decision for whether browser folder import + preview can work given the
 * detected platform capabilities. Side-effect free so it is trivially unit
 * testable; environment probing lives in {@link detectFolderImportSupport}.
 */
export function getFolderImportSupport(
  capabilities: FolderImportCapabilities,
): FolderImportSupport {
  // Preview/assessment always runs WebAssembly. Embedded contexts (e.g. the
  // VS Code Simple Browser webview) frequently block wasm compilation, which
  // would let files be picked but never previewed.
  if (!capabilities.hasWebAssembly) {
    return { reason: "no-webassembly", supported: false };
  }

  // Folder selection needs either the File System Access API or the
  // <input webkitdirectory> fallback.
  if (!capabilities.canPickFolder) {
    return { reason: "no-picker", supported: false };
  }

  return { reason: null, supported: true };
}

function hasDirectoryInputSupport(documentRef: Document | undefined): boolean {
  if (!documentRef || typeof documentRef.createElement !== "function") {
    return false;
  }

  try {
    return "webkitdirectory" in documentRef.createElement("input");
  } catch {
    return false;
  }
}

function hasWebAssemblySupport(global: typeof globalThis): boolean {
  const wasm = (global as typeof globalThis & { WebAssembly?: typeof WebAssembly }).WebAssembly;
  if (!wasm || typeof wasm.Module !== "function" || typeof wasm.instantiate !== "function") {
    return false;
  }

  try {
    // Minimal valid module (magic + version). Compiling it triggers any CSP
    // restriction (a missing 'wasm-unsafe-eval'), unlike a mere feature check.
    const probeModule = new wasm.Module(
      Uint8Array.of(0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00),
    );
    return probeModule instanceof wasm.Module;
  } catch {
    return false;
  }
}

let cachedFolderImportSupport: FolderImportSupport | undefined;

/**
 * Probe the current environment for folder import support. The result for the
 * real global is cached (the capabilities never change within a page); pass an
 * explicit `global` in tests to bypass the cache.
 */
export function detectFolderImportSupport(
  global: typeof globalThis = globalThis,
): FolderImportSupport {
  const useCache = global === globalThis;
  if (useCache && cachedFolderImportSupport) {
    return cachedFolderImportSupport;
  }

  const documentRef = (global as typeof globalThis & { document?: Document }).document;
  const support = getFolderImportSupport({
    canPickFolder: WebFileSystemAccess.supported(global) || hasDirectoryInputSupport(documentRef),
    hasWebAssembly: hasWebAssemblySupport(global),
  });

  if (useCache) {
    cachedFolderImportSupport = support;
  }

  return support;
}
