import { Emitter } from "src/cs/base/common/event";
import { Disposable, toDisposable, type IDisposable } from "src/cs/base/common/lifecycle";
import { URI } from "src/cs/base/common/uri";
import {
  FileType,
  type IFileContent,
  type IFileChange,
  type IFileStat,
  type IFileSystemProvider,
  type IReadFileOptions,
  type IWatchOptions,
} from "src/cs/platform/files/common/files";
import { sliceReadFileContent } from "src/cs/platform/files/common/io";
import {
  WebFileSystemAccess,
  type FileSystemDirectoryHandle,
  type FileSystemFileHandle,
  type FileSystemHandle,
} from "src/cs/platform/files/browser/webFileSystemAccess";

type RegisteredBrowserFileRoot = {
  readonly handle: FileSystemDirectoryHandle;
  readonly path: string;
};

type RegisteredBrowserFile = {
  readonly file: File;
  readonly path: string;
};

type BrowserDirectoryInputFile = File & {
  readonly webkitRelativePath?: string;
};

type BrowserFileTreeDirectory = {
  readonly children: Map<string, BrowserFileTreeEntry>;
  readonly name: string;
};

type BrowserFileTreeFile = {
  readonly file: File;
  readonly name: string;
};

type BrowserFileTreeEntry = BrowserFileTreeDirectory | BrowserFileTreeFile;

function normalizePath(path: string): string {
  const normalized = String(path ?? "").replace(/\\/g, "/").replace(/\/+/g, "/");
  if (!normalized || normalized === ".") {
    return "/";
  }

  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

function createRandomId(prefix: string): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `${prefix}_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
}

function getNameExtension(name: string): string {
  const dotIndex = name.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === name.length - 1) {
    return "";
  }

  return name.slice(dotIndex);
}

function isTreeDirectory(entry: BrowserFileTreeEntry): entry is BrowserFileTreeDirectory {
  return "children" in entry;
}

function createTreeDirectory(name: string): BrowserFileTreeDirectory {
  return {
    children: new Map<string, BrowserFileTreeEntry>(),
    name,
  };
}

function getSafePathParts(path: string): string[] {
  return normalizePath(path)
    .split("/")
    .map(part => part.trim())
    .filter(part => part && part !== "." && part !== "..");
}

function getFileRelativePath(file: BrowserDirectoryInputFile): string {
  return file.webkitRelativePath || file.name || "file";
}

function getVirtualRootName(files: readonly BrowserDirectoryInputFile[]): string {
  for (const file of files) {
    const rootName = getSafePathParts(getFileRelativePath(file))[0];
    if (rootName) {
      return rootName;
    }
  }

  return "folder";
}

function createDirectoryInputHandle(files: readonly BrowserDirectoryInputFile[]): FileSystemDirectoryHandle {
  const root = createTreeDirectory(getVirtualRootName(files));

  for (const file of files) {
    const parts = getSafePathParts(getFileRelativePath(file));
    if (parts.length === 0) {
      continue;
    }

    const pathParts = parts[0] === root.name ? parts.slice(1) : parts;
    const fileName = pathParts.pop() || file.name || "file";
    let current = root;
    for (const part of pathParts) {
      const existing = current.children.get(part);
      if (existing && isTreeDirectory(existing)) {
        current = existing;
        continue;
      }

      const next = createTreeDirectory(part);
      current.children.set(part, next);
      current = next;
    }

    current.children.set(fileName, { file, name: fileName });
  }

  return toDirectoryHandle(root);
}

function toDirectoryHandle(directory: BrowserFileTreeDirectory): FileSystemDirectoryHandle {
  const getChild = (name: string): BrowserFileTreeEntry | undefined => directory.children.get(name);
  const handle: FileSystemDirectoryHandle = {
    kind: "directory",
    name: directory.name,
    entries: async function* entries() {
      for (const [name, child] of directory.children) {
        yield [
          name,
          isTreeDirectory(child) ? toDirectoryHandle(child) : toFileHandle(child),
        ];
      }
    },
    getDirectoryHandle: async (name: string) => {
      const child = getChild(name);
      if (child && isTreeDirectory(child)) {
        return toDirectoryHandle(child);
      }

      throw new Error(`Directory '${name}' was not found.`);
    },
    getFileHandle: async (name: string) => {
      const child = getChild(name);
      if (child && !isTreeDirectory(child)) {
        return toFileHandle(child);
      }

      throw new Error(`File '${name}' was not found.`);
    },
  };
  handle[Symbol.asyncIterator] = handle.entries;

  return handle;
}

function toFileHandle(entry: BrowserFileTreeFile): FileSystemFileHandle {
  return {
    kind: "file",
    name: entry.name,
    getFile: async () => entry.file,
  };
}

async function isSameEntry(
  first: FileSystemHandle | undefined,
  second: FileSystemHandle,
): Promise<boolean> {
  if (!first) {
    return false;
  }

  if (first === second) {
    return true;
  }

  return typeof first.isSameEntry === "function" && await first.isSameEntry(second);
}

function toFileType(handle: FileSystemHandle): FileType {
  return WebFileSystemAccess.isFileSystemDirectoryHandle(handle)
    ? FileType.Directory
    : FileType.File;
}

async function ensureHandlePermission(handle: FileSystemHandle): Promise<void> {
  if (typeof handle.queryPermission !== "function") {
    return;
  }

  const permission = await handle.queryPermission();
  if (permission === "granted") {
    return;
  }

  if (typeof handle.requestPermission === "function" && await handle.requestPermission() === "granted") {
    return;
  }

  throw new Error(`Permission denied for browser file handle '${handle.name}'.`);
}

function readDirectoryEntries(
  handle: FileSystemDirectoryHandle,
): AsyncIterableIterator<[string, FileSystemHandle]> {
  if (typeof handle.entries === "function") {
    return handle.entries();
  }

  const iterator = handle[Symbol.asyncIterator];
  if (typeof iterator === "function") {
    return iterator.call(handle);
  }

  if (typeof handle.values === "function") {
    return readDirectoryValues(handle.values());
  }

  throw new Error(`Directory handle '${handle.name}' cannot be enumerated.`);
}

async function* readDirectoryValues(
  values: AsyncIterableIterator<FileSystemHandle>,
): AsyncIterableIterator<[string, FileSystemHandle]> {
  for await (const handle of values) {
    yield [handle.name, handle];
  }
}

function encodeBase64(content: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < content.length; index += chunkSize) {
    const chunk = content.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

async function fileToContent(
  file: File,
  options: IReadFileOptions = {},
): Promise<IFileContent> {
  const buffer = new Uint8Array(await file.arrayBuffer());
  const content = sliceReadFileContent(buffer, options);
  const encoding = options.encoding === "base64" ? "base64" : "utf8";

  return {
    encoding,
    value: encoding === "base64"
      ? encodeBase64(content)
      : new TextDecoder().decode(content),
  };
}

export class HTMLFileSystemProvider extends Disposable implements IFileSystemProvider {
  private readonly roots = new Map<string, RegisteredBrowserFileRoot>();
  private readonly files = new Map<string, RegisteredBrowserFile>();
  private readonly onDidFilesChangeEmitter = this._register(new Emitter<readonly IFileChange[]>());
  public readonly onDidFilesChange = this.onDidFilesChangeEmitter.event;

  public async registerDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<URI> {
    const path = await this.registerHandle(handle);
    return URI.file(path);
  }

  public async registerDirectoryInputFiles(files: readonly File[]): Promise<URI> {
    return this.registerDirectoryHandle(createDirectoryInputHandle(files));
  }

  public registerFile(file: File): URI {
    const id = createRandomId("browserfile");
    const path = `/${id}/${encodeURIComponent(file.name || "file")}`;
    this.files.set(path, { file, path });
    return URI.file(path);
  }

  public async exists(resource: URI): Promise<boolean> {
    if (this.getFile(resource)) {
      return true;
    }

    try {
      await this.resolve(resource);
      return true;
    } catch {
      return false;
    }
  }

  public async readDir(resource: URI): Promise<readonly [string, FileType][]> {
    const resolved = await this.resolve(resource);
    if (resolved.handle.kind !== "directory") {
      throw new Error(`Expected directory resource '${resource.toString()}'.`);
    }

    const entries: [string, FileType][] = [];
    for await (const [name, handle] of readDirectoryEntries(resolved.handle)) {
      entries.push([name, toFileType(handle)]);
    }

    return entries;
  }

  public async readFile(
    resource: URI,
    options?: IReadFileOptions,
  ): Promise<IFileContent> {
    const registeredFile = this.getFile(resource);
    if (registeredFile) {
      return fileToContent(registeredFile.file, options);
    }

    const resolved = await this.resolve(resource);
    if (resolved.handle.kind !== "file") {
      throw new Error(`Expected file resource '${resource.toString()}'.`);
    }

    return fileToContent(await resolved.handle.getFile(), options);
  }

  public async realpath(resource: URI): Promise<URI> {
    if (this.getFile(resource)) {
      return resource;
    }

    await this.resolve(resource);
    return resource;
  }

  public async stat(resource: URI): Promise<IFileStat> {
    const registeredFile = this.getFile(resource);
    if (registeredFile) {
      return {
        ctime: registeredFile.file.lastModified,
        mtime: registeredFile.file.lastModified,
        path: resource.fsPath,
        size: registeredFile.file.size,
        type: FileType.File,
      };
    }

    const resolved = await this.resolve(resource);
    if (resolved.handle.kind === "directory") {
      return {
        ctime: 0,
        mtime: 0,
        path: resource.fsPath,
        size: 0,
        type: FileType.Directory,
      };
    }

    const file = await resolved.handle.getFile();
    return {
      ctime: file.lastModified,
      mtime: file.lastModified,
      path: resource.fsPath,
      size: file.size,
      type: FileType.File,
    };
  }

  public watch(_resource: URI, _options?: IWatchOptions): IDisposable {
    return toDisposable(() => undefined);
  }

  private async registerHandle(handle: FileSystemDirectoryHandle): Promise<string> {
    const handleName = handle.name || "folder";
    let path = `/${handleName}`;

    if (
      this.roots.has(path) &&
      !await isSameEntry(this.roots.get(path)?.handle, handle)
    ) {
      const extension = getNameExtension(handleName);
      const name = handleName.slice(0, handleName.length - extension.length) || handleName;
      let counter = 1;
      do {
        path = `/${name}-${counter}${extension}`;
        counter += 1;
      } while (
        this.roots.has(path) &&
        !await isSameEntry(this.roots.get(path)?.handle, handle)
      );
    }

    this.roots.set(path, { handle, path });
    return path;
  }

  private getFile(resource: URI): RegisteredBrowserFile | null {
    const uri = URI.revive(resource);
    return this.files.get(normalizePath(uri.path)) ?? null;
  }

  private async resolve(resource: URI): Promise<{ handle: FileSystemHandle }> {
    const uri = URI.revive(resource);
    const path = normalizePath(uri.path);
    const root = this.getRoot(path);
    if (!root) {
      throw new Error(`Browser file handle not registered for '${uri.toString()}'.`);
    }

    await ensureHandlePermission(root.handle);

    const relativePath = path.slice(root.path.length).replace(/^\/+/, "");
    if (!relativePath) {
      return { handle: root.handle };
    }

    let current: FileSystemDirectoryHandle = root.handle;
    const parts = relativePath.split("/").filter(Boolean);
    for (let index = 0; index < parts.length; index += 1) {
      const name = parts[index];
      const isLast = index === parts.length - 1;
      if (isLast) {
        try {
          return { handle: await current.getDirectoryHandle(name) };
        } catch {
          return { handle: await current.getFileHandle(name) };
        }
      }

      current = await current.getDirectoryHandle(name);
    }

    return { handle: current };
  }

  private getRoot(path: string): RegisteredBrowserFileRoot | null {
    let match: RegisteredBrowserFileRoot | null = null;
    for (const root of this.roots.values()) {
      if (
        path === root.path ||
        path.startsWith(`${root.path}/`)
      ) {
        if (!match || root.path.length > match.path.length) {
          match = root;
        }
      }
    }

    return match;
  }
}

export function isHTMLFileSystemAccessSupported(): boolean {
  return WebFileSystemAccess.supported(globalThis);
}
