import { Disposable, type IDisposable } from "src/cs/base/common/lifecycle";
import { Emitter, Event, type Event as EventType } from "src/cs/base/common/event";
import { isLinux } from "src/cs/base/common/platform";
import type { IChannel } from "src/cs/base/parts/ipc/common/ipc";
import { URI } from "src/cs/base/common/uri";
import {
  IFileService,
  LOCAL_FILE_SYSTEM_CHANNEL_NAME,
  FileSystemProviderCapabilities,
  type IFileContent,
  type IFileChange,
  type IFileSystemProviderCapabilitiesChangeEvent,
  type IFileSystemProviderRegistrationEvent,
  type IFileStat,
  type IFileSystemProvider,
  type IReadFileOptions,
  type IWatchOptions,
  type IWriteFileOptions,
  type FileType,
  type FileWriteLockState,
} from "src/cs/platform/files/common/files";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import { IMainProcessService } from "src/cs/platform/ipc/common/mainProcessService";
import { WatcherClient } from "src/cs/platform/files/electron-browser/watcherClient";

export class ElectronBrowserFileService extends Disposable implements IFileService {
  public declare readonly _serviceBrand: undefined;

  private readonly onDidFilesChangeEmitter = this._register(new Emitter<readonly IFileChange[]>());
  public readonly onDidFilesChange: EventType<readonly IFileChange[]> = this.onDidFilesChangeEmitter.event;
  public readonly onDidChangeFileSystemProviderCapabilities =
    Event.None as EventType<IFileSystemProviderCapabilitiesChangeEvent>;
  public readonly onDidChangeFileSystemProviderRegistrations =
    Event.None as EventType<IFileSystemProviderRegistrationEvent>;

  private readonly channel: IChannel;
  private readonly watcherClient: WatcherClient;

  constructor(
    @IMainProcessService mainProcessService: IMainProcessService,
  ) {
    super();

    this.channel = mainProcessService.getChannel(LOCAL_FILE_SYSTEM_CHANNEL_NAME);
    this.watcherClient = this._register(new WatcherClient(this.channel));
    this._register(this.watcherClient.onDidFilesChange(changes => this.onDidFilesChangeEmitter.fire(changes)));
  }

  public exists(resource: URI): Promise<boolean> {
    return this.channel.call("exists", [resource]);
  }

  public getWriteLockState(resource: URI): Promise<FileWriteLockState> {
    return this.channel.call("getWriteLockState", [resource]);
  }

  public registerProvider(_scheme: string, _provider: IFileSystemProvider): IDisposable {
    throw new Error("Electron browser file service does not support local provider registration.");
  }

  public getProvider(_scheme: string): IFileSystemProvider | undefined {
    return undefined;
  }

  public getProviderCapabilities(resourceOrScheme: URI | string): FileSystemProviderCapabilities {
    const scheme = typeof resourceOrScheme === "string"
      ? resourceOrScheme
      : URI.revive(resourceOrScheme).scheme;
    if (scheme !== "file") {
      throw new Error(`No file system provider registered for '${scheme}'.`);
    }

    return FileSystemProviderCapabilities.FileRead |
      FileSystemProviderCapabilities.FileReadRange |
      FileSystemProviderCapabilities.FileWrite |
      FileSystemProviderCapabilities.FileAtomicWrite |
      FileSystemProviderCapabilities.FileDelete |
      FileSystemProviderCapabilities.FileTrash |
      FileSystemProviderCapabilities.FileWatch |
      (isLinux ? FileSystemProviderCapabilities.PathCaseSensitive : FileSystemProviderCapabilities.None);
  }

  public hasProvider(resource: URI): boolean {
    return URI.revive(resource).scheme === "file";
  }

  public hasCapability(resource: URI, capability: FileSystemProviderCapabilities): boolean {
    return Boolean(this.hasProvider(resource) && (this.getProviderCapabilities(resource) & capability));
  }

  public *listCapabilities(): Iterable<{ readonly capabilities: FileSystemProviderCapabilities; readonly scheme: string }> {
    yield {
      capabilities: this.getProviderCapabilities("file"),
      scheme: "file",
    };
  }

  public readDir(resource: URI): Promise<readonly [string, FileType][]> {
    return this.channel.call("readDir", [resource]);
  }

  public readFile(resource: URI, options?: IReadFileOptions): Promise<IFileContent> {
    return this.channel.call("readFile", [resource, options ?? {}]);
  }

  public writeFile(resource: URI, content: string, options?: IWriteFileOptions): Promise<void> {
    return this.channel.call("writeFile", [resource, content, options ?? {}]);
  }

  public deleteFile(resource: URI): Promise<void> {
    return this.channel.call("deleteFile", [resource]);
  }

  public moveFileToTrash(resource: URI): Promise<void> {
    return this.channel.call("moveFileToTrash", [resource]);
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

registerSingleton(IFileService, ElectronBrowserFileService, InstantiationType.Delayed);
