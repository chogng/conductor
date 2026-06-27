import assert from "assert";
import { Buffer } from "node:buffer";

import { Emitter, Event, type Event as EventType } from "src/cs/base/common/event";
import {
  ChannelClient,
  ChannelServer,
  type IChannel,
  type IMessagePassingProtocol,
  type IServerChannel,
} from "src/cs/base/parts/ipc/common/ipc";
import type { CancellationToken } from "src/cs/base/common/async";
import type { IDisposable } from "src/cs/base/common/lifecycle";
import { URI } from "src/cs/base/common/uri";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import { LOCAL_FILE_SYSTEM_CHANNEL_NAME } from "src/cs/platform/files/common/files";
import { ElectronBrowserFileService } from "src/cs/platform/files/electron-browser/fileService";
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
