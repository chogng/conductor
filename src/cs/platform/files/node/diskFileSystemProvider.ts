import fs from "node:fs";
import path from "node:path";
import { Emitter, Event } from "../../../base/common/event.js";
import { DisposableStore, toDisposable, type IDisposable } from "../../../base/common/lifecycle.js";
import { URI } from "../../../base/common/uri.js";
import {
  FileChangeType,
  FileType,
  type IFileContent,
  type IFileChange,
  type IFileStat,
  type IReadFileOptions,
  type IWatchOptions,
} from "../common/files.js";

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
  private readonly watchers = new Map<string, IDisposable>();

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
    const encoding = options.encoding === "base64" ? "base64" : "utf8";

    return {
      encoding,
      value: encoding === "base64" ? buffer.toString("base64") : buffer.toString("utf8"),
    };
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
    const targetStat = fs.statSync(target);
    const watchRoot = targetStat.isDirectory() ? target : path.dirname(target);
    const store = new DisposableStore();
    const watcher = fs.watch(
      target,
      { recursive: options.recursive === true },
      (_eventType, fileName) => {
        const normalizedName = typeof fileName === "string" ? fileName.trim() : "";
        const changedPath = normalizedName
          ? path.resolve(watchRoot, normalizedName)
          : target;
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
