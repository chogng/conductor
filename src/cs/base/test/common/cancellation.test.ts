import assert from "assert";

import {
	cancelOnDispose,
	CancellationToken,
	CancellationTokenPool,
	CancellationTokenSource,
} from "../../common/cancellation.ts";
import { DisposableStore } from "../../common/lifecycle.ts";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("base/test/common/cancellation", () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test("CancellationTokenSource fires listeners once and reports cancellation", () => {
		const source = store.add(new CancellationTokenSource());
		let calls = 0;

		store.add(source.token.onCancellationRequested(() => calls++));
		source.cancel();
		source.cancel();

		assert.deepStrictEqual({
			isCancellationRequested: source.token.isCancellationRequested,
			calls,
		}, {
			isCancellationRequested: true,
			calls: 1,
		});
	});

	test("cancelled tokens notify late listeners on a future turn", async () => {
		let calls = 0;

		const disposable = store.add(CancellationToken.Cancelled.onCancellationRequested(() => calls++));
		assert.equal(calls, 0);

		await new Promise(resolve => setTimeout(resolve, 0));
		disposable.dispose();

		assert.equal(calls, 1);
	});

	test("parent cancellation cancels child source", () => {
		const parent = store.add(new CancellationTokenSource());
		const child = store.add(new CancellationTokenSource(parent.token));
		let calls = 0;

		store.add(child.token.onCancellationRequested(() => calls++));
		parent.cancel();

		assert.deepStrictEqual({
			childCancelled: child.token.isCancellationRequested,
			calls,
		}, {
			childCancelled: true,
			calls: 1,
		});
	});

	test("dispose can request cancellation", () => {
		const source = store.add(new CancellationTokenSource());
		let calls = 0;

		store.add(source.token.onCancellationRequested(() => calls++));
		source.dispose(true);

		assert.deepStrictEqual({
			isCancellationRequested: source.token.isCancellationRequested,
			calls,
		}, {
			isCancellationRequested: true,
			calls: 1,
		});
	});

	test("cancelOnDispose cancels token when store is disposed", () => {
		const disposableStore = store.add(new DisposableStore());
		const token = cancelOnDispose(disposableStore);
		let calls = 0;

		store.add(token.onCancellationRequested(() => calls++));
		disposableStore.dispose();

		assert.deepStrictEqual({
			isCancellationRequested: token.isCancellationRequested,
			calls,
		}, {
			isCancellationRequested: true,
			calls: 1,
		});
	});

	test("CancellationTokenPool cancels after every token is cancelled", () => {
		const pool = store.add(new CancellationTokenPool());
		const first = store.add(new CancellationTokenSource());
		const second = store.add(new CancellationTokenSource());
		let calls = 0;

		store.add(pool.token.onCancellationRequested(() => calls++));
		pool.add(first.token);
		pool.add(second.token);

		first.cancel();
		const afterFirst = pool.token.isCancellationRequested;
		second.cancel();

		assert.deepStrictEqual({
			afterFirst,
			afterSecond: pool.token.isCancellationRequested,
			calls,
		}, {
			afterFirst: false,
			afterSecond: true,
			calls: 1,
		});
	});
});
