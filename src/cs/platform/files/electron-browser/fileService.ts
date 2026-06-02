import { Disposable, toDisposable, type IDisposable } from "src/cs/base/common/lifecycle";
import { Emitter, type Event as EventType } from "src/cs/base/common/event";
import { URI } from "src/cs/base/common/uri";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import { ElectronIPCMainProcessService } from "src/cs/platform/ipc/electron-browser/mainProcessService";
import {
  IFileService,
  LOCAL_FILE_SYSTEM_FILE_CHANGE_EVENT,
  LOCAL_FILE_SYSTEM_CHANNEL_NAME,
  type IFileContent,
  type IFileChange,
  type IFileStat,
  type IFileSystemProvider,
  type IReadFileOptions,
  type IWatchOptions,
  type FileType,
} from "src/cs/platform/files/common/files";

export class ElectronBrowserFileService extends Disposable implements IFileService {
  public declare readonly _serviceBrand: undefined;

  private readonly sessionId = this.createId("session");
  private readonly onDidFilesChangeEmitter = this._register(new Emitter<readonly IFileChange[]>());
  public readonly onDidFilesChange: EventType<readonly IFileChange[]> = this.onDidFilesChangeEmitter.event;

  private readonly mainProcessService = this._register(new ElectronIPCMainProcessService());
  private readonly channel = this.mainProcessService.getChannel(LOCAL_FILE_SYSTEM_CHANNEL_NAME);

  constructor() {
    super();

    this._register(this.channel.listen<readonly IFileChange[]>(
      LOCAL_FILE_SYSTEM_FILE_CHANGE_EVENT,
      [this.sessionId],
    )((paths) => {
      if (Array.isArray(paths) && paths.length > 0) {
        this.onDidFilesChangeEmitter.fire(paths.map(change => ({
          resource: URI.revive(change.resource),
          type: change.type,
        })));
      }
    }));
  }

  public exists(resource: URI): Promise<boolean> {
    return this.channel.call("exists", [resource]);
  }

  public registerProvider(_scheme: string, _provider: IFileSystemProvider): IDisposable {
    throw new Error("Electron browser file service does not support local provider registration.");
  }

  public getProvider(_scheme: string): IFileSystemProvider | undefined {
    return undefined;
  }

  public readDir(resource: URI): Promise<readonly [string, FileType][]> {
    return this.channel.call("readDir", [resource]);
  }

  public readFile(resource: URI, options?: IReadFileOptions): Promise<IFileContent> {
    return this.channel.call("readFile", [resource, options ?? {}]);
  }

  public realpath(resource: URI): Promise<URI> {
    return this.channel.call("realpath", [resource]);
  }

  public stat(resource: URI): Promise<IFileStat> {
    return this.channel.call("stat", [resource]);
  }

  public watch(resource: URI, options?: IWatchOptions): IDisposable {
    const watchId = this.createId("watch");
    void this.channel.call("watch", [this.sessionId, watchId, resource, options ?? {}]);

    return toDisposable(() => {
      void this.channel.call("unwatch", [this.sessionId, watchId]);
    });
  }

  private createId(prefix: string): string {
    if (
      typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
    ) {
      return crypto.randomUUID();
    }

    return `${prefix}_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
  }
}

export const fileService = new ElectronBrowserFileService();

registerSingleton(IFileService, ElectronBrowserFileService, InstantiationType.Delayed);
