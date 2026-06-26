/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import type { CancellationToken } from "src/cs/base/common/async";
import { Emitter } from "src/cs/base/common/event";
import { Disposable, type IDisposable } from "src/cs/base/common/lifecycle";
import { URI } from "src/cs/base/common/uri";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import { DecorationsService } from "src/cs/workbench/services/decorations/browser/decorationsService";
import type {
	IDecorationData,
	IDecorationsProvider,
} from "src/cs/workbench/services/decorations/common/decorations";

suite("workbench/services/decorations/test/browser/decorationsService", () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test("returns provider decoration data ordered by newest provider first", () => {
		const service = store.add(new DecorationsService());
		const resource = URI.file("/workspace/data.csv");

		store.add(service.registerDecorationsProvider(store.add(new TestDecorationsProvider("first", {
			letter: "A",
			tooltip: "First",
		}))));
		store.add(service.registerDecorationsProvider(store.add(new TestDecorationsProvider("second", {
			letter: "B",
			tooltip: "Second",
		}))));

		const data = service.getDecorationData(resource, false);

		assert.deepEqual(data.map(item => item.letter), ["B", "A"]);
		assert.equal(service.getDecoration(resource, false)?.tooltip, "Second - First");
	});

	test("refreshes cached provider data when the provider reports a changed resource", () => {
		const service = store.add(new DecorationsService());
		const resource = URI.file("/workspace/data.csv");
		const provider = new TestDecorationsProvider("review", {
			letter: "P",
			tooltip: "Pending",
		});
		store.add(provider);
		store.add(service.registerDecorationsProvider(provider));

		assert.equal(service.getDecorationData(resource, false)[0]?.letter, "P");

		provider.data = {
			letter: "R",
			tooltip: "Ready",
		};
		provider.fire([resource]);

		assert.equal(service.getDecorationData(resource, false)[0]?.letter, "R");
	});

	test("cancels pending async requests when the same provider resource is refreshed", async () => {
		const service = store.add(new DecorationsService());
		const resource = URI.file("/workspace/data.csv");
		const provider = new AsyncDecorationsProvider();
		store.add(provider);
		store.add(service.registerDecorationsProvider(provider));

		assert.equal(service.getDecorationData(resource, false).length, 0);
		provider.fire([resource]);
		assert.equal(provider.cancelCount, 1);

		provider.resolveNext({
			letter: "R",
			tooltip: "Ready",
		});
		await provider.whenSettled();

		assert.equal(service.getDecorationData(resource, false)[0]?.letter, "R");
	});

	test("includes cached child decorations only when they bubble", () => {
		const service = store.add(new DecorationsService());
		const folder = URI.file("/workspace");
		const child = URI.file("/workspace/data.csv");
		const provider = new ResourceDecorationsProvider(new Map([
			[child.toString(), { bubble: true, letter: "C", tooltip: "Child" }],
		]));
		store.add(provider);
		store.add(service.registerDecorationsProvider(provider));

		assert.equal(service.getDecorationData(child, false)[0]?.letter, "C");
		assert.equal(service.getDecorationData(folder, true)[0]?.letter, "C");

		provider.data.set(child.toString(), { bubble: false, letter: "N", tooltip: "No Bubble" });
		provider.fire([child]);

		assert.equal(service.getDecorationData(child, false)[0]?.letter, "N");
		assert.equal(service.getDecorationData(folder, true).length, 0);
	});
});

class TestDecorationsProvider extends Disposable implements IDecorationsProvider {
	private readonly onDidChangeEmitter = this._register(new Emitter<readonly URI[] | undefined>());
	public readonly onDidChange = this.onDidChangeEmitter.event;

	public constructor(
		public readonly label: string,
		public data: IDecorationData | undefined,
	) {
		super();
	}

	public provideDecorations(_uri: URI, _token: CancellationToken): IDecorationData | undefined {
		return this.data;
	}

	public fire(resources: readonly URI[] | undefined): void {
		this.onDidChangeEmitter.fire(resources);
	}
}

class ResourceDecorationsProvider extends Disposable implements IDecorationsProvider {
	public readonly label = "resource";
	private readonly onDidChangeEmitter = this._register(new Emitter<readonly URI[] | undefined>());
	public readonly onDidChange = this.onDidChangeEmitter.event;

	public constructor(
		public readonly data: Map<string, IDecorationData>,
	) {
		super();
	}

	public provideDecorations(uri: URI, _token: CancellationToken): IDecorationData | undefined {
		return this.data.get(uri.toString());
	}

	public fire(resources: readonly URI[] | undefined): void {
		this.onDidChangeEmitter.fire(resources);
	}
}

class AsyncDecorationsProvider extends Disposable implements IDecorationsProvider {
	public readonly label = "async";
	private readonly onDidChangeEmitter = this._register(new Emitter<readonly URI[] | undefined>());
	public readonly onDidChange = this.onDidChangeEmitter.event;

	private readonly pending: Array<{
		readonly listener: IDisposable;
		readonly resolve: (data: IDecorationData | undefined) => void;
		readonly promise: Promise<IDecorationData | undefined>;
	}> = [];
	private lastPromise: Promise<IDecorationData | undefined> | null = null;
	public cancelCount = 0;

	public provideDecorations(_uri: URI, token: CancellationToken): Promise<IDecorationData | undefined> {
		let listener: IDisposable = Disposable.None;
		listener = token.onCancellationRequested(() => {
			this.cancelCount += 1;
			listener.dispose();
		});

		let resolve!: (data: IDecorationData | undefined) => void;
		const promise = new Promise<IDecorationData | undefined>((complete) => {
			resolve = (data) => {
				listener.dispose();
				complete(data);
			};
		});
		this.lastPromise = promise;
		this.pending.push({ listener, promise, resolve });
		return promise;
	}

	public fire(resources: readonly URI[] | undefined): void {
		this.onDidChangeEmitter.fire(resources);
	}

	public resolveNext(data: IDecorationData | undefined): void {
		const request = this.pending.pop();
		assert.ok(request);
		request.resolve(data);
	}

	public whenSettled(): Promise<void> {
		return Promise.resolve(this.lastPromise).then(() => undefined);
	}
}
