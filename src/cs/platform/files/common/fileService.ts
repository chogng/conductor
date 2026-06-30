import { Emitter } from "../../../base/common/event.js";
import { Disposable, DisposableStore, toDisposable, type IDisposable } from "../../../base/common/lifecycle.js";
import { URI } from "../../../base/common/uri.js";
import {
  IFileService,
  FileSystemProviderCapabilities,
  type FileType,
  type IFileChange,
  type IFileContent,
  type IFileSystemProviderCapabilitiesChangeEvent,
  type IFileSystemProviderRegistrationEvent,
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
  private readonly providerDisposables = new Map<string, IDisposable>();
  private readonly onDidFilesChangeEmitter = this._register(new Emitter<readonly IFileChange[]>());
  public readonly onDidFilesChange = this.onDidFilesChangeEmitter.event;
  private readonly onDidChangeFileSystemProviderCapabilitiesEmitter =
    this._register(new Emitter<IFileSystemProviderCapabilitiesChangeEvent>());
  public readonly onDidChangeFileSystemProviderCapabilities =
    this.onDidChangeFileSystemProviderCapabilitiesEmitter.event;
  private readonly onDidChangeFileSystemProviderRegistrationsEmitter =
    this._register(new Emitter<IFileSystemProviderRegistrationEvent>());
  public readonly onDidChangeFileSystemProviderRegistrations =
    this.onDidChangeFileSystemProviderRegistrationsEmitter.event;

  public registerProvider(scheme: string, provider: IFileSystemProvider): IDisposable {
    if (this.providers.has(scheme)) {
      throw new Error(`A filesystem provider for the scheme '${scheme}' is already registered.`);
    }

    const providerDisposables = new DisposableStore();
    this.providers.set(scheme, provider);
    this.providerDisposables.set(scheme, providerDisposables);
    this.onDidChangeFileSystemProviderRegistrationsEmitter.fire({
      added: true,
      provider,
      scheme,
    });
    providerDisposables.add(
      provider.onDidFilesChange(changes => this.onDidFilesChangeEmitter.fire(changes)),
    );
    providerDisposables.add(provider.onDidChangeCapabilities(() => {
      this.onDidChangeFileSystemProviderCapabilitiesEmitter.fire({
        provider,
        scheme,
      });
    }));

    return toDisposable(() => {
      if (this.providers.get(scheme) === provider) {
        this.providers.delete(scheme);
        this.providerDisposables.delete(scheme);
        providerDisposables.dispose();
        this.onDidChangeFileSystemProviderRegistrationsEmitter.fire({
          added: false,
          provider,
          scheme,
        });
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

  public hasProvider(resource: URI): boolean {
    return this.providers.has(URI.revive(resource).scheme);
  }

  public hasCapability(resource: URI, capability: FileSystemProviderCapabilities): boolean {
    const provider = this.getProvider(URI.revive(resource).scheme);
    return Boolean(provider && (provider.capabilities & capability));
  }

  public *listCapabilities(): Iterable<{ readonly capabilities: FileSystemProviderCapabilities; readonly scheme: string }> {
    for (const [scheme, provider] of this.providers) {
      yield {
        capabilities: provider.capabilities,
        scheme,
      };
    }
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

  public override dispose(): void {
    for (const disposable of this.providerDisposables.values()) {
      disposable.dispose();
    }
    this.providerDisposables.clear();
    this.providers.clear();
    super.dispose();
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
