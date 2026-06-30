import assert from "assert";

import { Emitter } from "../../../../base/common/event.ts";
import { toDisposable, type IDisposable } from "../../../../base/common/lifecycle.ts";
import { URI } from "../../../../base/common/uri.ts";
import { FileService } from "../../common/fileService.ts";
import {
  FileChangeType,
  FileSystemProviderCapabilities,
  FileType,
  type IFileChange,
  type IFileContent,
  type IFileStat,
  type IFileSystemProvider,
  type IReadFileOptions,
  type IWatchOptions,
} from "../../common/files.ts";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("platform/files/test/common/fileService", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  class TestFileSystemProvider implements IFileSystemProvider {
    private readonly onDidFilesChangeEmitter = new Emitter<readonly IFileChange[]>();
    private readonly onDidChangeCapabilitiesEmitter = new Emitter<void>();
    public readonly onDidFilesChange = this.onDidFilesChangeEmitter.event;
    public readonly onDidChangeCapabilities = this.onDidChangeCapabilitiesEmitter.event;
    public readonly seenPaths: string[] = [];

    public constructor(
      public capabilities =
        FileSystemProviderCapabilities.FileRead |
        FileSystemProviderCapabilities.FileReadRange |
        FileSystemProviderCapabilities.FileWrite |
        FileSystemProviderCapabilities.FileDelete |
        FileSystemProviderCapabilities.FileTrash |
        FileSystemProviderCapabilities.FileWatch,
    ) {}

    public fire(changes: readonly IFileChange[]): void {
      this.onDidFilesChangeEmitter.fire(changes);
    }

    public setCapabilities(capabilities: FileSystemProviderCapabilities): void {
      this.capabilities = capabilities;
      this.onDidChangeCapabilitiesEmitter.fire();
    }

    public async exists(resource: URI): Promise<boolean> {
      this.seenPaths.push(URI.revive(resource).path);
      return true;
    }

    public async readDir(resource: URI): Promise<readonly [string, FileType][]> {
      this.seenPaths.push(URI.revive(resource).path);
      return [["transfer%25.csv", FileType.File]];
    }

    public async readFile(resource: URI, _options?: IReadFileOptions): Promise<IFileContent> {
      this.seenPaths.push(URI.revive(resource).path);
      return {
        value: new TextEncoder().encode("Vg,Id\n0,1"),
      };
    }

    public async writeFile(resource: URI, _content: string): Promise<void> {
      this.seenPaths.push(URI.revive(resource).path);
    }

    public async deleteFile(resource: URI): Promise<void> {
      this.seenPaths.push(URI.revive(resource).path);
    }

    public async moveFileToTrash(resource: URI): Promise<void> {
      this.seenPaths.push(URI.revive(resource).path);
    }

    public async realpath(resource: URI): Promise<URI> {
      this.seenPaths.push(URI.revive(resource).path);
      return resource;
    }

    public async stat(resource: URI): Promise<IFileStat> {
      this.seenPaths.push(URI.revive(resource).path);
      return {
        ctime: 0,
        mtime: 0,
        path: URI.revive(resource).path,
        size: 9,
        type: FileType.File,
      };
    }

    public watch(resource: URI, _options?: IWatchOptions): IDisposable {
      this.seenPaths.push(URI.revive(resource).path);
      return toDisposable(() => undefined);
    }
  }

  test("FileService delegates resources to the registered provider without decoding paths", async () => {
    const service = store.add(new FileService());
    const provider = new TestFileSystemProvider();
    store.add(service.registerProvider("test", provider));
    const resource = URI.from({
      scheme: "test",
      path: "/folder/transfer%25.csv",
    });

    assert.equal(await service.exists(resource), true);
    assert.equal((await service.stat(resource)).type, FileType.File);
    assert.equal(new TextDecoder().decode((await service.readFile(resource)).value), "Vg,Id\n0,1");
    await service.deleteFile(resource);
    await service.moveFileToTrash(resource);
    assert.deepEqual(provider.seenPaths, [
      "/folder/transfer%25.csv",
      "/folder/transfer%25.csv",
      "/folder/transfer%25.csv",
      "/folder/transfer%25.csv",
      "/folder/transfer%25.csv",
    ]);
  });

  test("FileService forwards provider file change events until registration is disposed", () => {
    const service = store.add(new FileService());
    const provider = new TestFileSystemProvider();
    const registration = store.add(service.registerProvider("test", provider));
    const resource = URI.from({
      scheme: "test",
      path: "/folder/transfer%25.csv",
    });
    const changes: Array<readonly IFileChange[]> = [];
    store.add(service.onDidFilesChange(event => {
      changes.push(event);
    }));

    provider.fire([{ resource, type: FileChangeType.UPDATED }]);
    registration.dispose();
    provider.fire([{ resource, type: FileChangeType.DELETED }]);

    assert.equal(changes.length, 1);
    assert.deepEqual(changes[0], [{ resource, type: FileChangeType.UPDATED }]);
  });

  test("FileService exposes provider capabilities", () => {
    const service = store.add(new FileService());
    const provider = new TestFileSystemProvider();
    store.add(service.registerProvider("test", provider));
    const resource = URI.from({ path: "/folder/transfer.csv", scheme: "test" });

    const capabilities = service.getProviderCapabilities("test");

    assert.equal(Boolean(capabilities & FileSystemProviderCapabilities.FileRead), true);
    assert.equal(Boolean(capabilities & FileSystemProviderCapabilities.FileWatch), true);
    assert.equal(service.hasProvider(resource), true);
    assert.equal(service.hasCapability(resource, FileSystemProviderCapabilities.FileRead), true);
    assert.deepEqual([...service.listCapabilities()], [{
      capabilities: provider.capabilities,
      scheme: "test",
    }]);
  });

  test("FileService emits provider registration events and rejects duplicate schemes", () => {
    const service = store.add(new FileService());
    const provider = new TestFileSystemProvider();
    const events: Array<{ readonly added: boolean; readonly provider: IFileSystemProvider; readonly scheme: string }> = [];
    store.add(service.onDidChangeFileSystemProviderRegistrations(event => events.push(event)));

    const registration = service.registerProvider("test", provider);

    assert.throws(
      () => service.registerProvider("test", new TestFileSystemProvider()),
      /already registered/,
    );

    registration.dispose();

    assert.deepEqual(events, [
      { added: true, provider, scheme: "test" },
      { added: false, provider, scheme: "test" },
    ]);
    assert.equal(service.hasProvider(URI.from({ path: "/folder/transfer.csv", scheme: "test" })), false);
  });

  test("FileService forwards provider capability change events until registration is disposed", () => {
    const service = store.add(new FileService());
    const provider = new TestFileSystemProvider(FileSystemProviderCapabilities.FileRead);
    const registration = service.registerProvider("test", provider);
    const events: Array<{ readonly provider: IFileSystemProvider; readonly scheme: string }> = [];
    store.add(service.onDidChangeFileSystemProviderCapabilities(event => events.push(event)));

    provider.setCapabilities(
      FileSystemProviderCapabilities.FileRead |
      FileSystemProviderCapabilities.PathCaseSensitive,
    );
    registration.dispose();
    provider.setCapabilities(FileSystemProviderCapabilities.FileRead);

    assert.deepEqual(events, [{ provider, scheme: "test" }]);
  });
});
