import assert from "assert";

import { Emitter } from "src/cs/base/common/event";
import { toDisposable, type IDisposable } from "src/cs/base/common/lifecycle";
import { URI } from "src/cs/base/common/uri";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import { FileService } from "src/cs/platform/files/common/fileService";
import {
  FileSystemProviderCapabilities,
  FileType,
  type IFileChange,
  type IFileContent,
  type IFileStat,
  type IFileSystemProvider,
  type IReadFileOptions,
  type IWatchOptions,
  type IWriteFileOptions,
} from "src/cs/platform/files/common/files";
import { UriIdentityService } from "src/cs/platform/uriIdentity/common/uriIdentityService";

suite("platform/uriIdentity/common/UriIdentityService", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();

  test("canonicalizes provider URI paths and preserves caller fragments", () => {
    const fileService = store.add(new FileService());
    store.add(fileService.registerProvider("test", new TestFileSystemProvider(
      FileSystemProviderCapabilities.FileRead,
    )));
    const service = store.add(new UriIdentityService(fileService));
    const first = URI.from({
      fragment: "first",
      path: "/workspace/data/../data/File.csv",
      scheme: "test",
    });
    const second = URI.from({
      fragment: "second",
      path: "/workspace/data/file.csv",
      scheme: "test",
    });

    const canonicalFirst = service.asCanonicalUri(first);
    const canonicalSecond = service.asCanonicalUri(second);

    assert.equal(canonicalFirst.path, "/workspace/data/File.csv");
    assert.equal(canonicalFirst.fragment, "first");
    assert.equal(canonicalSecond.path, canonicalFirst.path);
    assert.equal(canonicalSecond.fragment, "second");
  });

  test("keeps private non-provider URI paths unchanged", () => {
    const fileService = store.add(new FileService());
    const service = store.add(new UriIdentityService(fileService));
    const resource = URI.from({
      path: "/workspace/data/../data/File.csv",
      scheme: "memory",
    });

    assert.equal(service.asCanonicalUri(resource).path, resource.path);
    assert.equal(service.extUri.isEqual(
      URI.from({ path: "/workspace/Data.csv", scheme: "memory" }),
      URI.from({ path: "/workspace/data.csv", scheme: "memory" }),
    ), false);
  });

  test("updates URI path casing comparison when provider capabilities change", () => {
    const fileService = store.add(new FileService());
    const provider = new TestFileSystemProvider(FileSystemProviderCapabilities.FileRead);
    store.add(fileService.registerProvider("case", provider));
    const service = store.add(new UriIdentityService(fileService));
    const upper = URI.from({ path: "/workspace/Data.csv", scheme: "case" });
    const lower = URI.from({ path: "/workspace/data.csv", scheme: "case" });

    assert.equal(service.extUri.isEqual(upper, lower), true);

    provider.setCapabilities(
      FileSystemProviderCapabilities.FileRead |
      FileSystemProviderCapabilities.PathCaseSensitive,
    );

    assert.equal(service.extUri.isEqual(upper, lower), false);
  });

  test("updates URI path casing comparison when a provider is removed", () => {
    const fileService = store.add(new FileService());
    const provider = new TestFileSystemProvider(FileSystemProviderCapabilities.FileRead);
    const registration = fileService.registerProvider("gone", provider);
    const service = store.add(new UriIdentityService(fileService));
    const upper = URI.from({ path: "/workspace/Data.csv", scheme: "gone" });
    const lower = URI.from({ path: "/workspace/data.csv", scheme: "gone" });

    assert.equal(service.extUri.isEqual(upper, lower), true);

    registration.dispose();

    assert.equal(service.extUri.isEqual(upper, lower), false);
  });
});

class TestFileSystemProvider implements IFileSystemProvider {
  private readonly filesChanged = new Emitter<readonly IFileChange[]>();
  private readonly capabilitiesChanged = new Emitter<void>();
  public readonly onDidFilesChange = this.filesChanged.event;
  public readonly onDidChangeCapabilities = this.capabilitiesChanged.event;

  public constructor(
    public capabilities: FileSystemProviderCapabilities,
  ) {}

  public setCapabilities(capabilities: FileSystemProviderCapabilities): void {
    this.capabilities = capabilities;
    this.capabilitiesChanged.fire();
  }

  public exists(_resource: URI): Promise<boolean> {
    return Promise.resolve(true);
  }

  public readDir(_resource: URI): Promise<readonly [string, FileType][]> {
    return Promise.resolve([]);
  }

  public readFile(_resource: URI, _options?: IReadFileOptions): Promise<IFileContent> {
    return Promise.resolve({ value: new Uint8Array() });
  }

  public writeFile(_resource: URI, _content: string, _options?: IWriteFileOptions): Promise<void> {
    return Promise.resolve();
  }

  public deleteFile(_resource: URI): Promise<void> {
    return Promise.resolve();
  }

  public moveFileToTrash(_resource: URI): Promise<void> {
    return Promise.resolve();
  }

  public realpath(resource: URI): Promise<URI> {
    return Promise.resolve(resource);
  }

  public stat(resource: URI): Promise<IFileStat> {
    return Promise.resolve({
      ctime: 0,
      mtime: 0,
      path: resource.path,
      size: 0,
      type: FileType.File,
    });
  }

  public watch(_resource: URI, _options?: IWatchOptions): IDisposable {
    return toDisposable(() => undefined);
  }
}
