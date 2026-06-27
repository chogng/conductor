import { Emitter } from "../../../base/common/event.js";
import { Disposable, toDisposable, type IDisposable } from "../../../base/common/lifecycle.js";
import { URI } from "../../../base/common/uri.js";
import {
  IFileService,
  FileSystemProviderCapabilities,
  type FileType,
  type IFileChange,
  type IFileContent,
  type IFileStat,
  type IFileSystemProvider,
  type IReadFileOptions,
  type IWatchOptions,
  type IWriteFileOptions,
} from "./files.js";
import { InstantiationType, registerSingleton } from "../../instantiation/common/extensions.js";

export class FileService extends Disposable implements IFileService {
  public declare readonly _serviceBrand: undefined;

  private readonly providers = new Map<string, IFileSystemProvider>();
  private readonly providerListeners = new Map<string, IDisposable>();
  private readonly onDidFilesChangeEmitter = this._register(new Emitter<readonly IFileChange[]>());
  public readonly onDidFilesChange = this.onDidFilesChangeEmitter.event;

  public registerProvider(scheme: string, provider: IFileSystemProvider): IDisposable {
    const previous = this.providerListeners.get(scheme);
    previous?.dispose();

    this.providers.set(scheme, provider);
    this.providerListeners.set(
      scheme,
      provider.onDidFilesChange(changes => this.onDidFilesChangeEmitter.fire(changes)),
    );

    return toDisposable(() => {
      if (this.providers.get(scheme) === provider) {
        this.providers.delete(scheme);
        this.providerListeners.get(scheme)?.dispose();
        this.providerListeners.delete(scheme);
      }
    });
  }

  public getProvider(scheme: string): IFileSystemProvider | undefined {
    return this.providers.get(scheme);
  }

  public getProviderCapabilities(resourceOrScheme: URI | string): FileSystemProviderCapabilities {
    const scheme = typeof resourceOrScheme === "string"
      ? resourceOrScheme
      : URI.revive(resourceOrScheme).scheme;
    const provider = this.getProvider(scheme);
    if (!provider) {
      throw new Error(`No file system provider registered for '${scheme}'.`);
    }

    return provider.capabilities;
  }

  public exists(resource: URI): Promise<boolean> {
    return this.withProvider(resource).exists(resource);
  }

  public readDir(resource: URI): Promise<readonly [string, FileType][]> {
    return this.withProvider(resource).readDir(resource);
  }

  public readFile(resource: URI, options?: IReadFileOptions): Promise<IFileContent> {
    return this.withProvider(resource).readFile(resource, options);
  }

  public writeFile(resource: URI, content: string, options?: IWriteFileOptions): Promise<void> {
    return this.withProvider(resource).writeFile(resource, content, options);
  }

  public deleteFile(resource: URI): Promise<void> {
    return this.withProvider(resource).deleteFile(resource);
  }

  public moveFileToTrash(resource: URI): Promise<void> {
    const provider = this.withProvider(resource);
    if (!provider.moveFileToTrash) {
      return Promise.reject(new Error(`File system provider for '${resource.scheme}' does not support moving files to trash.`));
    }

    return provider.moveFileToTrash(resource);
  }

  public realpath(resource: URI): Promise<URI> {
    return this.withProvider(resource).realpath(resource);
  }

  public stat(resource: URI): Promise<IFileStat> {
    return this.withProvider(resource).stat(resource);
  }

  public watch(resource: URI, options?: IWatchOptions): IDisposable {
    return this.withProvider(resource).watch(resource, options);
  }

  private withProvider(resource: URI): IFileSystemProvider {
    const uri = URI.revive(resource);
    const provider = this.getProvider(uri.scheme);
    if (!provider) {
      throw new Error(`No file system provider registered for '${uri.scheme}'.`);
    }

    return provider;
  }
}

export const fileService = new FileService();

registerSingleton(IFileService, FileService, InstantiationType.Delayed);
