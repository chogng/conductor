import {
  DisposableStore,
  DisposableTracker,
  setDisposableTracker,
  type IDisposable,
} from "../../common/lifecycle.ts";

export function ensureNoDisposablesAreLeakedInTestSuite(): Pick<DisposableStore, "add"> {
  let tracker: DisposableTracker | undefined;
  let store: DisposableStore;

  setup(() => {
    store = new DisposableStore();
    tracker = new DisposableTracker();
    setDisposableTracker(tracker);
  });

  teardown(function (this: Mocha.Context) {
    store.dispose();
    setDisposableTracker(null);

    if (this.currentTest?.state === "failed") {
      return;
    }

    const result = tracker?.computeLeakingDisposables();
    if (result) {
      console.error(result.details);
      throw new Error(`There are ${result.leaks.length} undisposed disposables!${result.details}`);
    }
  });

  return {
    add<T extends IDisposable>(disposable: T): T {
      return store.add(disposable);
    },
  };
}

export function throwIfDisposablesAreLeaked(body: () => void, logToConsole = true): void {
  const tracker = new DisposableTracker();
  setDisposableTracker(tracker);

  try {
    body();
  } finally {
    setDisposableTracker(null);
  }

  computeLeakingDisposables(tracker, logToConsole);
}

export async function throwIfDisposablesAreLeakedAsync(body: () => Promise<void>, logToConsole = true): Promise<void> {
  const tracker = new DisposableTracker();
  setDisposableTracker(tracker);

  try {
    await body();
  } finally {
    setDisposableTracker(null);
  }

  computeLeakingDisposables(tracker, logToConsole);
}

function computeLeakingDisposables(tracker: DisposableTracker, logToConsole = true): void {
  const result = tracker.computeLeakingDisposables();
  if (!result) {
    return;
  }

  if (logToConsole) {
    console.error(result.details);
  }

  throw new Error(`There are ${result.leaks.length} undisposed disposables!${result.details}`);
}
