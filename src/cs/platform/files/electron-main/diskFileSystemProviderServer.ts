import { Emitter, Event } from "../../../base/common/event.js";
import type { IServerChannel } from "../../../base/parts/ipc/common/ipc.js";
import { URI } from "../../../base/common/uri.js";
import { DisposableStore, type IDisposable } from "../../../base/common/lifecycle.js";
import { DiskFileSystemProvider } from "../node/diskFileSystemProvider.js";
import {
  LOCAL_FILE_SYSTEM_FILE_CHANGE_EVENT,
  type IFileChange,
  type IReadFileOptions,
  type IWatchOptions,
  type IWriteFileOptions,
} from "../common/files.js";

type SessionWatcher = {
  readonly emitter: Emitter<readonly IFileChange[]>;
  readonly provider: DiskFileSystemProvider;
  readonly store: DisposableStore;
};

export class DiskFileSystemProviderChannel implements IServerChannel<string> {
  private readonly sessionToWatcher = new Map<string, SessionWatcher>();
  private readonly watchRequests = new Map<string, IDisposable>();

  constructor(private readonly provider: DiskFileSystemProvider) {}

  public listen<T>(_ctx: string, event: string, arg?: unknown): Event<T> {
    if (event === LOCAL_FILE_SYSTEM_FILE_CHANGE_EVENT) {
      const args = Array.isArray(arg) ? arg : [];
      return this.onFileChange(String(args[0] ?? "")) as Event<T>;
    }

    return Event.None as Event<T>;
  }

  public async call<T>(
    _ctx: string,
    command: string,
    arg?: unknown,
  ): Promise<T> {
    const args = Array.isArray(arg) ? arg : [];

    switch (command) {
      case "capabilities":
        return this.provider.capabilities as T;
      case "stat":
        return this.provider.stat(URI.revive(args[0])) as Promise<T>;
      case "exists":
        return this.provider.exists(URI.revive(args[0])) as Promise<T>;
      case "readDir":
        return this.provider.readDir(URI.revive(args[0])) as Promise<T>;
      case "readFile":
        return this.provider.readFile(
          URI.revive(args[0]),
          (args[1] as IReadFileOptions | undefined) ?? {},
        ) as Promise<T>;
      case "writeFile":
        return this.provider.writeFile(
          URI.revive(args[0]),
          String(args[1] ?? ""),
          (args[2] as IWriteFileOptions | undefined) ?? {},
        ) as Promise<T>;
      case "deleteFile":
        return this.provider.deleteFile(URI.revive(args[0])) as Promise<T>;
      case "moveFileToTrash":
        return this.provider.moveFileToTrash(URI.revive(args[0])) as Promise<T>;
      case "realpath":
        return this.provider.realpath(URI.revive(args[0])) as Promise<T>;
      case "watch":
        this.watch(
          String(args[0] ?? ""),
          String(args[1] ?? ""),
          URI.revive(args[2]),
          (args[3] as IWatchOptions | undefined) ?? {},
        );
        return Promise.resolve(undefined as T);
      case "unwatch":
        this.unwatch(String(args[0] ?? ""), String(args[1] ?? ""));
        return Promise.resolve(undefined as T);
      default:
        return Promise.reject(new Error(`Unknown local filesystem command '${command}'.`));
    }
  }

  private onFileChange(sessionId: string): Event<readonly IFileChange[]> {
    let session = this.sessionToWatcher.get(sessionId);
    if (!session) {
      const store = new DisposableStore();
      const provider = new DiskFileSystemProvider();
      const emitter = store.add(new Emitter<readonly IFileChange[]>({
        onDidRemoveLastListener: () => this.disposeSession(sessionId),
      }));
      store.add(provider.onDidFilesChange(changes => emitter.fire(changes)));
      session = { emitter, provider, store };
      this.sessionToWatcher.set(sessionId, session);
    }

    return session.emitter.event;
  }

  private watch(
    sessionId: string,
    watchId: string,
    resource: URI,
    options: IWatchOptions,
  ): void {
    const session = this.sessionToWatcher.get(sessionId);
    if (!session || !watchId) {
      return;
    }

    const requestKey = this.createRequestKey(sessionId, watchId);
    this.watchRequests.get(requestKey)?.dispose();
    this.watchRequests.set(
      requestKey,
      session.provider.watch(watchId, resource, options),
    );
  }

  private unwatch(sessionId: string, watchId: string): void {
    const requestKey = this.createRequestKey(sessionId, watchId);
    this.watchRequests.get(requestKey)?.dispose();
    this.watchRequests.delete(requestKey);
  }

  private disposeSession(sessionId: string): void {
    this.sessionToWatcher.get(sessionId)?.store.dispose();
    this.sessionToWatcher.delete(sessionId);

    for (const [requestKey, disposable] of this.watchRequests) {
      if (requestKey.startsWith(`${sessionId}:`)) {
        disposable.dispose();
        this.watchRequests.delete(requestKey);
      }
    }
  }

  private createRequestKey(sessionId: string, watchId: string): string {
    return `${sessionId}:${watchId}`;
  }
}
