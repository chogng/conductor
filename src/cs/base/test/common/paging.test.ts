import assert from "assert";

import { DeferredPromise } from "../../common/async.ts";
import { CancellationTokenSource, type CancellationToken } from "../../common/cancellation.ts";
import { PagedModel, type IPager } from "../../common/paging.ts";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("base/test/common/paging", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();

  test("PagedModel keeps a shared page request alive while another index waits", async () => {
    const page = new DeferredPromise<readonly string[]>();
    let pageToken: CancellationToken | undefined;
    const pager: IPager<string> = {
      firstPage: [],
      getPage: (_pageIndex, cancellationToken) => {
        pageToken = cancellationToken;
        return page.p;
      },
      pageSize: 2,
      total: 4,
    };
    const model = new PagedModel(pager);
    const first = store.add(new CancellationTokenSource());
    const second = store.add(new CancellationTokenSource());

    const firstElement = model.resolve(2, first.token);
    const secondElement = model.resolve(3, second.token);

    first.cancel();
    assert.equal(pageToken?.isCancellationRequested, false);

    page.complete(["c", "d"]);

    assert.equal(await firstElement, "c");
    assert.equal(await secondElement, "d");
    assert.equal(model.isResolved(2), true);
    assert.equal(model.get(3), "d");
  });

  test("PagedModel clears waiters after a failed page request", async () => {
    const pages: Array<DeferredPromise<readonly string[]>> = [];
    const pageTokens: CancellationToken[] = [];
    const pager: IPager<string> = {
      firstPage: [],
      getPage: (_pageIndex, cancellationToken) => {
        const page = new DeferredPromise<readonly string[]>();
        pages.push(page);
        pageTokens.push(cancellationToken);
        return page.p;
      },
      pageSize: 2,
      total: 4,
    };
    const model = new PagedModel(pager);
    const first = store.add(new CancellationTokenSource());

    const firstElement = model.resolve(3, first.token);
    pages[0].error(new Error("failed"));
    await assert.rejects(firstElement, /failed/);

    const second = store.add(new CancellationTokenSource());
    const secondElement = model.resolve(2, second.token);
    second.cancel();

    assert.equal(pageTokens[1].isCancellationRequested, true);
    pages[1].cancel();
    await assert.rejects(secondElement);
  });
});
