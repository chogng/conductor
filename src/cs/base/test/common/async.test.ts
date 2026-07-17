import assert from "assert";

import {
  asPromise,
  createCancelablePromise,
  DeferredPromise,
  Delayer,
  disposableTimeout,
  isThenable,
  raceCancellation,
  raceTimeout,
  RunOnceScheduler,
  TaskSequentializer,
  Throttler,
  timeout,
  TimeoutTimer,
} from "../../common/async.ts";
import { CancellationToken, CancellationTokenSource } from "../../common/cancellation.ts";
import {
  CancellationError,
  isCancellationError,
} from "../../common/errors.ts";
import { toDisposable } from "../../common/lifecycle.ts";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("base/test/common/async", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();

  test("createCancelablePromise rejects with CancellationError on cancel", async () => {
    const promise = createCancelablePromise(async token => {
      await timeout(10, token);
    });

    promise.cancel();
    await assert.rejects(promise, error => isCancellationError(error));
  });

  test("asPromise and isThenable normalize sync, async and throwing callbacks", async () => {
    assert.equal(isThenable(Promise.resolve(1)), true);
    assert.equal(await asPromise(() => 1), 1);
    assert.equal(await asPromise(() => Promise.resolve(2)), 2);
    await assert.rejects(asPromise(() => {
      throw new Error("boom");
    }), /boom/);
  });

  test("timeout supports cancellation tokens and cancelable promises", async () => {
    await timeout(0);

    const source = store.add(new CancellationTokenSource());
    const pending = timeout(20, source.token);
    source.cancel();

    await assert.rejects(pending, error => error instanceof CancellationError);
    await assert.rejects(timeout(1, CancellationToken.Cancelled), error => error instanceof CancellationError);
  });

  test("raceCancellation returns immediately without cancelling the original promise", async () => {
    const source = store.add(new CancellationTokenSource());
    let resolveOriginal!: (value: string) => void;
    const original = new Promise<string>(resolve => {
      resolveOriginal = resolve;
    });
    const raced = raceCancellation(original, source.token, "cancelled");

    source.cancel();
    assert.equal(await raced, "cancelled");

    resolveOriginal("late");
    assert.equal(await original, "late");
  });

  test("disposableTimeout can cancel scheduled work", async () => {
    let didRun = false;
    const disposable = store.add(disposableTimeout(() => {
      didRun = true;
    }, 5));

    disposable.dispose();
    await new Promise(resolve => setTimeout(resolve, 10));

    assert.equal(didRun, false);
  });

  test("TimeoutTimer schedules and cancels work", async () => {
    let calls = 0;
    const timer = store.add(new TimeoutTimer());

    timer.cancelAndSet(() => calls++, 0);
    assert.equal(timer.isScheduled(), true);
    await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(calls, 1);
    assert.equal(timer.isScheduled(), false);

    timer.setIfNotSet(() => calls++, 5);
    timer.setIfNotSet(() => calls += 10, 5);
    timer.cancel();
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(calls, 1);
  });

  test("raceTimeout returns promise value or timeout result", async () => {
    let timedOut = false;

    assert.equal(await raceTimeout(Promise.resolve("ok"), 10), "ok");
    assert.equal(await raceTimeout(new Promise(resolve => setTimeout(resolve, 20)), 0, () => {
      timedOut = true;
    }), undefined);
    assert.equal(timedOut, true);
  });

  test("DeferredPromise settles once and supports cancellation", async () => {
    const complete = new DeferredPromise<number>();
    complete.complete(1);
    complete.complete(2);
    assert.equal(await complete.promise, 1);
    assert.equal(complete.isSettled, true);

    const cancelled = new DeferredPromise<void>();
    cancelled.cancel();
    await assert.rejects(cancelled.promise, error => error instanceof CancellationError);
  });

  test("Delayer runs the latest task after the delay", async () => {
    const delayer = store.add(new Delayer<number>(0));
    const first = delayer.trigger(() => 1, 5);
    const second = delayer.trigger(() => 2, 0);

    assert.equal(await first, 2);
    assert.equal(await second, 2);
  });

  test("Throttler runs the active task and only the latest queued task", async () => {
    const throttler = new Throttler();
    const order: string[] = [];
    let releaseFirst!: () => void;

    const first = throttler.queue(async () => {
      order.push("first");
      await new Promise<void>(resolve => {
        releaseFirst = resolve;
      });
      return "first";
    });
    const second = throttler.queue(async () => {
      order.push("second");
      return "second";
    });
    const third = throttler.queue(async () => {
      order.push("third");
      return "third";
    });

    releaseFirst();

    assert.equal(await first, "first");
    assert.equal(await second, "third");
    assert.equal(await third, "third");
    assert.deepEqual(order, ["first", "third"]);
  });

  test("RunOnceScheduler runs only the last scheduled callback", async () => {
    let calls = 0;
    const scheduler = store.add(new RunOnceScheduler(() => calls++, 5));

    scheduler.schedule();
    scheduler.schedule(0);
    await new Promise(resolve => setTimeout(resolve, 5));

    assert.equal(calls, 1);
    assert.equal(scheduler.isScheduled(), false);
  });

  test("TaskSequentializer tracks pending tasks and disposes replaced pending work", async () => {
    const sequentializer = store.add(new TaskSequentializer());
    const disposed: string[] = [];
    const first = new DeferredPromise<void>();
    const second = new DeferredPromise<void>();

    sequentializer.setPending(first.promise, toDisposable(() => disposed.push("first")));
    assert.equal(sequentializer.hasPending(), true);

    sequentializer.setPending(second.promise, toDisposable(() => disposed.push("second")));
    assert.deepEqual(disposed, ["first"]);

    second.complete();
    await sequentializer.join();
    assert.equal(sequentializer.hasPending(), false);
    assert.deepEqual(disposed, ["first", "second"]);
  });
});
