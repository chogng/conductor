import assert from "assert";

import type { CancellationToken } from "src/cs/base/common/cancellation";
import { ErrorNoTelemetry } from "src/cs/base/common/errors";
import { Emitter, Event, type Event as EventType } from "src/cs/base/common/event";
import type { IDisposable } from "src/cs/base/common/lifecycle";
import {
	ChannelClient,
	ChannelServer,
	type IChannel,
	type IMessagePassingProtocol,
	type IServerChannel,
} from "src/cs/base/parts/ipc/common/ipc";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("base/parts/ipc/common/ipc", () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test("preserves structured errors from synchronous channel failures", async () => {
		const { client, server } = createChannelPair(store);
		server.registerChannel("test", new TestServerChannel());
		const channel = client.getChannel<IChannel>("test");

		await assert.rejects(channel.call("syncFailure"), error => {
			const actual = error as ErrorNoTelemetry & { cause?: unknown; code?: string };
			assert.equal(actual instanceof ErrorNoTelemetry, true);
			assert.equal(actual.message, "Operation failed");
			assert.equal(actual.code, "E_OPERATION");
			assert.equal(actual.cause instanceof Error, true);
			assert.equal((actual.cause as Error).message, "Root failure");
			return true;
		});
	});

	test("normalizes non-Error promise rejections", async () => {
		const { client, server } = createChannelPair(store);
		server.registerChannel("test", new TestServerChannel());
		const channel = client.getChannel<IChannel>("test");

		await assert.rejects(channel.call("stringFailure"), error => {
			assert.equal(error instanceof Error, true);
			assert.equal((error as Error).message, "String failure");
			return true;
		});
	});

	test("normalizes unknown-channel failures", async () => {
		const { client } = createChannelPair(store);
		const channel = client.getChannel<IChannel>("missing");

		await assert.rejects(channel.call("call"), /Unknown channel: missing/);
	});
});

class TestServerChannel implements IServerChannel<string> {
	public call<T>(
		_ctx: string,
		command: string,
		_arg?: unknown,
		_cancellationToken?: CancellationToken,
	): Promise<T> {
		if (command === "syncFailure") {
			const error = new ErrorNoTelemetry("Operation failed") as ErrorNoTelemetry & {
				cause?: unknown;
				code?: string;
			};
			error.code = "E_OPERATION";
			error.cause = new Error("Root failure");
			throw error;
		}
		if (command === "stringFailure") {
			return Promise.reject("String failure");
		}
		return Promise.reject(new Error(`Unexpected command '${command}'.`));
	}

	public listen<T>(): EventType<T> {
		return Event.None as EventType<T>;
	}
}

class TestProtocol implements IMessagePassingProtocol, IDisposable {
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

function createChannelPair(store: { add<T extends IDisposable>(value: T): T }): {
	readonly client: ChannelClient;
	readonly server: ChannelServer<string>;
} {
	const clientProtocol = store.add(new TestProtocol());
	const serverProtocol = store.add(new TestProtocol());
	clientProtocol.connect(serverProtocol);
	serverProtocol.connect(clientProtocol);
	const client = store.add(new ChannelClient(clientProtocol));
	const server = store.add(new ChannelServer(serverProtocol, "test-window"));
	return { client, server };
}
