import assert from "assert";

import { timeout } from "../../common/async.ts";
import { CancellationTokenSource, type CancellationToken } from "../../common/cancellation.ts";
import { cancelPreviousCalls, debounce, memoize, throttle } from "../../common/decorators.ts";
import { Disposable } from "../../common/lifecycle.ts";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("base/test/common/decorators", () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test("memoize caches getter and zero-argument method results per instance", () => {
		class Counter {
			public getterCalls = 0;
			public methodCalls = 0;

			@memoize
			public get value(): number {
				this.getterCalls += 1;
				return this.getterCalls;
			}

			@memoize
			public next(): number {
				this.methodCalls += 1;
				return this.methodCalls;
			}
		}

		const first = new Counter();
		const second = new Counter();

		assert.equal(first.value, 1);
		assert.equal(first.value, 1);
		assert.equal(first.getterCalls, 1);
		assert.equal(first.next(), 1);
		assert.equal(first.next(), 1);
		assert.equal(first.methodCalls, 1);
		assert.equal(second.value, 1);
		assert.equal(second.getterCalls, 1);
	});

	test("debounce runs once with reduced arguments", async () => {
		class Recorder {
			public readonly values: string[] = [];

			@debounce<string[]>(5, (previous, value: string) => [...previous, value], () => [])
			public record(values: string[]): void {
				this.values.push(values.join(","));
			}
		}

		const recorder = new Recorder();
		recorder.record("a" as unknown as string[]);
		recorder.record("b" as unknown as string[]);

		await timeout(20);

		assert.deepEqual(recorder.values, ["a,b"]);
	});

	test("throttle runs immediately and then once with reduced pending arguments", async () => {
		class Recorder {
			public readonly values: string[] = [];

			@throttle<string[]>(20, (previous, value: string) => [...previous, value], () => [])
			public record(values: string[]): void {
				this.values.push(values.join(","));
			}
		}

		const recorder = new Recorder();
		recorder.record("first" as unknown as string[]);
		recorder.record("second" as unknown as string[]);
		recorder.record("third" as unknown as string[]);

		assert.deepEqual(recorder.values, ["first"]);

		await timeout(40);

		assert.deepEqual(recorder.values, ["first", "second,third"]);
	});

	test("cancelPreviousCalls cancels the previous invocation token", () => {
		class Worker extends Disposable {
			public readonly tokens: CancellationToken[] = [];
			public cancelCount = 0;

			@cancelPreviousCalls
			public work(_label: string, token?: CancellationToken): void {
				assert.ok(token);
				this.tokens.push(token);
				let listener = Disposable.None;
				listener = token.onCancellationRequested(() => {
					this.cancelCount += 1;
					listener.dispose();
				});
				this._register(listener);
			}
		}

		const worker = store.add(new Worker());
		worker.work("first");
		worker.work("second");

		assert.equal(worker.tokens.length, 2);
		assert.equal(worker.tokens[0].isCancellationRequested, true);
		assert.equal(worker.tokens[1].isCancellationRequested, false);
		assert.equal(worker.cancelCount, 1);
	});

	test("cancelPreviousCalls links an existing parent cancellation token", () => {
		class Worker extends Disposable {
			public token: CancellationToken | undefined;

			@cancelPreviousCalls
			public work(token?: CancellationToken): void {
				this.token = token;
			}
		}

		const worker = store.add(new Worker());
		const source = new CancellationTokenSource();
		worker.work(source.token);

		assert.equal(worker.token?.isCancellationRequested, false);
		source.cancel();
		assert.equal(worker.token?.isCancellationRequested, true);
		source.dispose();
	});
});
