import { Emitter } from "src/cs/base/common/event";
import { Disposable, toDisposable, type IDisposable } from "src/cs/base/common/lifecycle";
import { URI } from "src/cs/base/common/uri";
import {
  IFileService,
  type FileType,
  type IFileChange,
  type IFileContent,
  type IFileStat,
  type IFileSystemProvider,
  type IReadFileOptions,
  type IWatchOptions,
} from "src/cs/platform/files/common/files";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";

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

  public exists(resource: URI): Promise<boolean> {
    return this.withProvider(resource).exists(resource);
  }

  public readDir(resource: URI): Promise<readonly [string, FileType][]> {
    return this.withProvider(resource).readDir(resource);
  }

  public readFile(resource: URI, options?: IReadFileOptions): Promise<IFileContent> {
    return this.withProvider(resource).readFile(resource, options);
  }

  public writeFile(resource: URI, content: string): Promise<void> {
    return this.withProvider(resource).writeFile(resource, content);
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
