import assert from "assert";
import { Buffer } from "node:buffer";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { Emitter, Event, type Event as EventType } from "src/cs/base/common/event";
import {
  ChannelClient,
  ChannelServer,
  type IChannel,
  type IMessagePassingProtocol,
  type IServerChannel,
} from "src/cs/base/parts/ipc/common/ipc";
import type { CancellationToken } from "src/cs/base/common/cancellation";
import type { IDisposable } from "src/cs/base/common/lifecycle";
import { URI } from "src/cs/base/common/uri";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import {
  FileChangeType,
  LOCAL_FILE_SYSTEM_CHANNEL_NAME,
  type IFileChange,
} from "src/cs/platform/files/common/files";
import { ElectronBrowserFileService } from "src/cs/platform/files/electron-browser/fileService";
import { DiskFileSystemProviderChannel } from "src/cs/platform/files/electron-main/diskFileSystemProviderServer";
import { DiskFileSystemProvider } from "src/cs/platform/files/node/diskFileSystemProvider";
import type { IMainProcessService } from "src/cs/platform/ipc/common/mainProcessService";

suite("platform/files/test/electron-browser/fileService", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();

  test("ElectronBrowserFileService receives IPC-marshalled Buffer readFile payloads as Uint8Array", async () => {
    const fileText = "Repeat,VAR2\n1,2";
    const protocols = createProtocolPair();
    store.add(protocols.client);
    store.add(protocols.server);
    const client = store.add(new ChannelClient(protocols.client));
    const server = store.add(new ChannelServer(protocols.server, "test-window"));
    const serverChannel = new TestServerChannel(fileText);
    server.registerChannel(LOCAL_FILE_SYSTEM_CHANNEL_NAME, serverChannel);
    const service = store.add(new ElectronBrowserFileService(
      new TestMainProcessService(client),
    ));

    const content = await service.readFile(URI.file("C:/transfer/3.csv"));
    await new Promise(resolve => setTimeout(resolve, 0));

    assert.equal(content.value instanceof Uint8Array, true);
    assert.equal(new TextDecoder().decode(content.value), fileText);
    assert.deepEqual(serverChannel.calls, [{
      command: "readFile",
      arg: [URI.file("C:/transfer/3.csv"), {}],
    }]);
  });

  test("ElectronBrowserFileService receives IPC provider file operation changes", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "conductor-files-"));
    try {
      const protocols = createProtocolPair();
      store.add(protocols.client);
      store.add(protocols.server);
      const client = store.add(new ChannelClient(protocols.client));
      const server = store.add(new ChannelServer(protocols.server, "test-window"));
      server.registerChannel(
        LOCAL_FILE_SYSTEM_CHANNEL_NAME,
        new DiskFileSystemProviderChannel(new DiskFileSystemProvider()),
      );
      const service = store.add(new ElectronBrowserFileService(
        new TestMainProcessService(client),
      ));
      const filePath = path.join(root, "settings.json");
      const change = waitForServiceChange(service, filePath);

      await service.writeFile(URI.file(filePath), "{\"editor.tabSize\":2}\n");

      const event = await change;
      assert.equal(event.resource.fsPath, filePath);
      assert.equal(event.type, FileChangeType.ADDED);
    } finally {
      fs.rmSync(root, { force: true, recursive: true });
    }
  });
});

class TestMainProcessService implements IMainProcessService {
  public declare readonly _serviceBrand: undefined;

  constructor(private readonly client: ChannelClient) {}

  public getChannel(channelName: string): IChannel {
    return this.client.getChannel(channelName);
  }

  public registerChannel(_channelName: string, _channel: IServerChannel<string>): void {
    // No-op for renderer-side file service tests.
  }
}

class TestServerChannel implements IServerChannel<string> {
  public readonly calls: Array<{ readonly command: string; readonly arg: unknown }> = [];

  constructor(private readonly fileText: string) {}

  public async call<T>(
    _ctx: string,
    command: string,
    arg?: unknown,
    _cancellationToken?: CancellationToken,
  ): Promise<T> {
    this.calls.push({ command, arg });

    if (command === "readFile") {
      return {
        value: Buffer.from(this.fileText, "utf8"),
      } as T;
    }

    throw new Error(`Unexpected command '${command}'.`);
  }

  public listen<T>(): EventType<T> {
    return Event.None as EventType<T>;
  }
}

class TestProtocol implements IMessagePassingProtocol {
  private peer: TestProtocol | null = null;
  private readonly onMessageEmitter = new Emitter<Uint8Array>();
  public readonly onMessage = this.onMessageEmitter.event;

  public connect(peer: TestProtocol): void {
    this.peer = peer;
  }

  public send(message: Uint8Array): void {
    this.peer?.onMessageEmitter.fire(message);
  }

  public dispose(): void {
    this.onMessageEmitter.dispose();
  }
}

const createProtocolPair = (): {
  readonly client: IMessagePassingProtocol & IDisposable;
  readonly server: IMessagePassingProtocol & IDisposable;
} => {
  const client = new TestProtocol();
  const server = new TestProtocol();
  client.connect(server);
  server.connect(client);
  return { client, server };
};

const waitForServiceChange = (
  service: { readonly onDidFilesChange: EventType<readonly IFileChange[]> },
  filePath: string,
): Promise<IFileChange> =>
  new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      disposable.dispose();
      reject(new Error(`Timed out waiting for file change: ${filePath}`));
    }, 2000);
    const disposable = service.onDidFilesChange(changes => {
      const change = changes.find(candidate => candidate.resource.fsPath === filePath);
      if (!change) {
        return;
      }

      clearTimeout(timeout);
      disposable.dispose();
      resolve(change);
    });
  });
