import { Disposable, type IDisposable } from "src/cs/base/common/lifecycle";
import { Emitter, type Event as EventType } from "src/cs/base/common/event";
import { URI } from "src/cs/base/common/uri";
import {
  IFileService,
  LOCAL_FILE_SYSTEM_CHANNEL_NAME,
  type IFileContent,
  type IFileChange,
  type IFileStat,
  type IFileSystemProvider,
  type IReadFileOptions,
  type IWatchOptions,
  type FileType,
} from "src/cs/platform/files/common/files";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import { ElectronIPCMainProcessService } from "src/cs/platform/ipc/electron-browser/mainProcessService";
import { WatcherClient } from "src/cs/workbench/services/files/electron-browser/watcherClient";

export class ElectronBrowserFileService extends Disposable implements IFileService {
  public declare readonly _serviceBrand: undefined;

  private readonly onDidFilesChangeEmitter = this._register(new Emitter<readonly IFileChange[]>());
  public readonly onDidFilesChange: EventType<readonly IFileChange[]> = this.onDidFilesChangeEmitter.event;

  private readonly mainProcessService = this._register(new ElectronIPCMainProcessService());
  private readonly channel = this.mainProcessService.getChannel(LOCAL_FILE_SYSTEM_CHANNEL_NAME);
  private readonly watcherClient = this._register(new WatcherClient(this.channel));

  constructor() {
    super();

    this._register(this.watcherClient.onDidFilesChange(changes => this.onDidFilesChangeEmitter.fire(changes)));
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
    return this.watcherClient.watch(resource, options);
  }
}

export const fileService = new ElectronBrowserFileService();

registerSingleton(IFileService, ElectronBrowserFileService, InstantiationType.Delayed);
