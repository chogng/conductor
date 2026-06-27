import fs from "node:fs";
import path from "node:path";
import { Emitter, Event } from "../../../base/common/event.js";
import { DisposableStore, toDisposable, type IDisposable } from "../../../base/common/lifecycle.js";
import { URI } from "../../../base/common/uri.js";
import {
  FileChangeType,
  FileSystemProviderCapabilities,
  FileType,
  type IFileContent,
  type IFileChange,
  type IFileStat,
  type IReadFileOptions,
  type IWatchOptions,
  type IWriteFileOptions,
} from "../common/files.js";
import { sliceReadFileContent } from "../common/io.js";

const toFileType = (stat: fs.Stats): FileType => {
  let type = FileType.Unknown;

  if (stat.isFile()) {
    type = FileType.File;
  } else if (stat.isDirectory()) {
    type = FileType.Directory;
  }

  if (stat.isSymbolicLink()) {
    type |= FileType.SymbolicLink;
  }

  return type;
};

export class DiskFileSystemProvider {
  private readonly onDidFilesChangeEmitter = new Emitter<readonly IFileChange[]>();
  public readonly onDidFilesChange = this.onDidFilesChangeEmitter.event;
  public readonly capabilities: FileSystemProviderCapabilities;
  private readonly watchers = new Map<string, IDisposable>();

  public constructor(
    private readonly trashItem?: (filePath: string) => Promise<void>,
  ) {
    this.capabilities =
      FileSystemProviderCapabilities.FileRead |
      FileSystemProviderCapabilities.FileReadRange |
      FileSystemProviderCapabilities.FileWrite |
      FileSystemProviderCapabilities.FileAtomicWrite |
      FileSystemProviderCapabilities.FileDelete |
      FileSystemProviderCapabilities.FileWatch |
      (trashItem ? FileSystemProviderCapabilities.FileTrash : FileSystemProviderCapabilities.None);
  }

  public async stat(resource: URI): Promise<IFileStat> {
    const target = this.toFilePath(resource);
    const stats = await fs.promises.stat(target);

    return {
      ctime: stats.birthtimeMs,
      mtime: stats.mtimeMs,
      path: target,
      size: stats.size,
      type: toFileType(stats),
    };
  }

  public async exists(resource: URI): Promise<boolean> {
    try {
      await fs.promises.access(this.toFilePath(resource), fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  public async readDir(resource: URI): Promise<readonly [string, FileType][]> {
    const target = this.toFilePath(resource);
    const entries = await fs.promises.readdir(target, { withFileTypes: true });

    return entries.map((entry) => {
      if (entry.isFile()) {
        return [entry.name, FileType.File] as const;
      }

      if (entry.isDirectory()) {
        return [entry.name, FileType.Directory] as const;
      }

      if (entry.isSymbolicLink()) {
        return [entry.name, FileType.SymbolicLink] as const;
      }

      return [entry.name, FileType.Unknown] as const;
    });
  }

  public async readFile(
    resource: URI,
    options: IReadFileOptions = {},
  ): Promise<IFileContent> {
    const target = this.toFilePath(resource);
    const buffer = await fs.promises.readFile(target);

    return {
      value: sliceReadFileContent(buffer, options),
    };
  }

  public async writeFile(
    resource: URI,
    content: string,
    options: IWriteFileOptions = {},
  ): Promise<void> {
    const target = this.toFilePath(resource);
    const didExist = await this.exists(resource);

    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    if (options.atomic === true) {
      await this.atomicWriteFile(target, content);
    } else {
      await fs.promises.writeFile(target, content, "utf8");
    }

    this.onDidFilesChangeEmitter.fire([{
      resource,
      type: didExist ? FileChangeType.UPDATED : FileChangeType.ADDED,
    }]);
  }

  public async deleteFile(resource: URI): Promise<void> {
    const didExist = await this.exists(resource);

    await fs.promises.rm(this.toFilePath(resource), { force: true });

    if (didExist) {
      this.onDidFilesChangeEmitter.fire([{
        resource,
        type: FileChangeType.DELETED,
      }]);
    }
  }

  public async moveFileToTrash(resource: URI): Promise<void> {
    if (!this.trashItem) {
      throw new Error("Moving files to trash is not supported by this file system provider.");
    }

    const didExist = await this.exists(resource);
    await this.trashItem(this.toFilePath(resource));

    if (didExist) {
      this.onDidFilesChangeEmitter.fire([{
        resource,
        type: FileChangeType.DELETED,
      }]);
    }
  }

  public async realpath(resource: URI): Promise<URI> {
    const target = await fs.promises.realpath(this.toFilePath(resource));
    return URI.file(path.normalize(target));
  }

  public watch(
    watchId: string,
    resource: URI,
    options: IWatchOptions = {},
  ): IDisposable {
    const existing = this.watchers.get(watchId);
    existing?.dispose();

    const target = this.toFilePath(resource);
    const targetStat = this.tryStat(target);
    const watchDirectory = targetStat?.isDirectory() === true ? target : path.dirname(target);
    const watchedFilePath = targetStat?.isDirectory() === true ? null : target;
    const store = new DisposableStore();
    const watcher = fs.watch(
      watchDirectory,
      { recursive: options.recursive === true },
      (_eventType, fileName) => {
        const normalizedName = typeof fileName === "string" ? fileName.trim() : "";
        const changedPath = normalizedName
          ? path.resolve(watchDirectory, normalizedName)
          : watchedFilePath ?? watchDirectory;
        if (watchedFilePath && path.normalize(changedPath) !== watchedFilePath) {
          return;
        }
        void this.resolveFileChange(path.normalize(changedPath), _eventType)
          .then(change => this.onDidFilesChangeEmitter.fire([change]))
          .catch(() => {
            this.onDidFilesChangeEmitter.fire([{
              resource: URI.file(path.normalize(changedPath)),
              type: FileChangeType.UPDATED,
            }]);
          });
      },
    );

    store.add(toDisposable(() => watcher.close()));
    store.add(toDisposable(() => {
      if (this.watchers.get(watchId) === store) {
        this.watchers.delete(watchId);
      }
    }));

    this.watchers.set(watchId, store);
    return store;
  }

  public unwatch(watchId: string): void {
    this.watchers.get(watchId)?.dispose();
    this.watchers.delete(watchId);
  }

  private async resolveFileChange(
    filePath: string,
    eventType: string,
  ): Promise<IFileChange> {
    if (eventType === "rename") {
      const exists = await this.exists(URI.file(filePath));
      return {
        resource: URI.file(filePath),
        type: exists ? FileChangeType.ADDED : FileChangeType.DELETED,
      };
    }

    return {
      resource: URI.file(filePath),
      type: FileChangeType.UPDATED,
    };
  }

  private async atomicWriteFile(target: string, content: string): Promise<void> {
    const tempPath = path.join(
      path.dirname(target),
      `.${path.basename(target)}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`,
    );
    try {
      await fs.promises.writeFile(tempPath, content, "utf8");
      await fs.promises.rename(tempPath, target);
    } catch (error) {
      await fs.promises.rm(tempPath, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  private tryStat(target: string): fs.Stats | null {
    try {
      return fs.statSync(target);
    } catch {
      return null;
    }
  }

  private toFilePath(resource: URI): string {
    const uri = URI.revive(resource);
    if (uri.scheme !== "file") {
      throw new Error(`Unsupported file resource scheme '${uri.scheme}'.`);
    }

    const target = path.normalize(uri.fsPath);
    if (!path.isAbsolute(target)) {
      throw new Error(`Expected an absolute file path for '${uri.toString()}'.`);
    }

    return target;
  }
}
