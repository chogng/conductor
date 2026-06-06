import { RunOnceScheduler } from "src/cs/base/common/async";
import { DisposableStore, type IDisposable } from "src/cs/base/common/lifecycle";
import { URI } from "src/cs/base/common/uri";
import type {
  IFileChange,
  IFileService,
} from "src/cs/platform/files/common/files";

const FOLDER_CHANGE_REACT_DELAY = 500;

export class WorkspaceWatcher implements IDisposable {
  private readonly store = new DisposableStore();
  private readonly scheduler = new RunOnceScheduler(() => {
    const folder = this.folder;
    if (folder) {
      this.onDidChangeFolder(folder);
    }
  }, FOLDER_CHANGE_REACT_DELAY);
  private folder: URI | null = null;

  constructor(
    private readonly filesService: IFileService,
    private readonly onDidChangeFolder: (folder: URI) => void,
  ) {}

  public get currentFolderKey(): string | null {
    return this.folder?.toString() ?? null;
  }

  public watch(folder: URI): void {
    this.clear();

    this.folder = folder;
    this.store.add(this.filesService.watch(folder, { recursive: true }));
    this.store.add(this.filesService.onDidFilesChange(changes => {
      if (this.isAffected(changes)) {
        this.scheduler.schedule();
      }
    }));
  }

  public clear(): void {
    this.folder = null;
    this.scheduler.cancel();
    this.store.clear();
  }

  public dispose(): void {
    this.scheduler.dispose();
    this.store.dispose();
  }

  private isAffected(changes: readonly IFileChange[]): boolean {
    const folderPath = this.folder?.fsPath;
    if (!folderPath) {
      return false;
    }

    return changes.some(change => isEqualOrParent(change.resource.fsPath, folderPath));
  }
}

function isEqualOrParent(resourcePath: string, folderPath: string): boolean {
  const resource = normalizeFsPath(resourcePath);
  const folder = normalizeFsPath(folderPath);
  return resource === folder || resource.startsWith(`${folder}/`);
}

function normalizeFsPath(value: string): string {
  return value.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}
