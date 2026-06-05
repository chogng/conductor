export type FileSystemHandleKind = "directory" | "file";

export type FileSystemHandleBase = {
  readonly kind: FileSystemHandleKind;
  readonly name: string;
  queryPermission?: () => Promise<PermissionState>;
  requestPermission?: () => Promise<PermissionState>;
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
