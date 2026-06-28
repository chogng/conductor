import assert from "assert";

import type { IPagedListOptions, IPagedRenderer } from "src/cs/base/browser/ui/list/listPaging";
import { PagedList } from "src/cs/base/browser/ui/list/listPaging";
import type { CancellationToken } from "src/cs/base/common/cancellation";
import { PagedModel, type IPager } from "src/cs/base/common/paging";
import { ScrollbarVisibility } from "src/cs/base/common/scrollable";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("base/test/browser/ui/list/listPaging", () => {
  ensureNoDisposablesAreLeakedInTestSuite();

  test("maps selection events to resolved paged elements", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const list = createPagedList(container);
    const events: string[][] = [];
    const listener = list.onDidChangeSelection(event => {
      events.push([...event.elements]);
    });

    try {
      list.model = new PagedModel(["alpha", "beta"]);
      list.setSelection([1]);

      assert.deepEqual(list.getSelection(), [1]);
      assert.deepEqual(list.getSelectedElements(), ["beta"]);
      assert.deepEqual(events, [["beta"]]);
    } finally {
      listener.dispose();
      list.dispose();
      container.remove();
    }
  });

  test("does not expose selection events for unresolved paged indexes", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const list = createPagedList(container);
    const events: string[][] = [];
    const listener = list.onDidChangeSelection(event => {
      events.push([...event.elements]);
    });

    try {
      list.model = new PagedModel(unresolvedSecondPagePager);
      list.setSelection([1]);

      assert.deepEqual(list.getSelection(), [1]);
      assert.deepEqual(list.getSelectedElements(), []);
      assert.deepEqual(events, []);
    } finally {
      listener.dispose();
      list.dispose();
      container.remove();
    }
  });

  test("forwards focus lifecycle mouse context pointer anchor and scroll surface", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const list = createPagedList(container);
    const clicks: Array<string | undefined> = [];
    const pointers: Array<string | undefined> = [];
    const context: Array<string | undefined> = [];
    let focusCount = 0;
    let blurCount = 0;
    let disposeCount = 0;
    const disposables = [
      list.onDidFocus(() => { focusCount += 1; }),
      list.onDidBlur(() => { blurCount += 1; }),
      list.onDidDispose(() => { disposeCount += 1; }),
      list.onMouseClick(event => clicks.push(event.element)),
      list.onPointer(event => pointers.push(event.element)),
      list.onContextMenu(event => context.push(event.element)),
    ];

    try {
      list.model = new PagedModel(["alpha", "beta", "gamma", "delta"]);
      list.layout(48, 200);

      assert.equal(list.widget.length, 4);
      assert.equal(list.length, 4);
      assert.equal(list.isDOMFocused(), false);

      list.domFocus();
      assert.equal(list.isDOMFocused(), true);

      const row = container.querySelector<HTMLElement>(".ui-list__row[data-index='1']");
      assert.ok(row);
      row.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      row.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));

      list.setAnchor(2);
      assert.equal(list.getAnchor(), 2);

      list.scrollTop = 24;
      await animationFrame();

      assert.equal(focusCount, 1);
      assert.deepEqual(clicks, ["beta"]);
      assert.deepEqual(pointers, ["beta"]);
      assert.deepEqual(context, ["beta"]);
      assert.equal(list.scrollTop, 24);

      list.getHTMLElement().blur();
      assert.equal(blurCount, 1);
    } finally {
      list.dispose();
      assert.equal(disposeCount, 1);
      for (const disposable of disposables) {
        disposable.dispose();
      }
      container.remove();
    }
  });

  test("maps unresolved pointer events without resolving the model", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const list = createPagedList(container);
    const clicks: Array<string | undefined> = [];
    const listener = list.onMouseClick(event => {
      clicks.push(event.element);
    });

    try {
      list.model = new PagedModel(unresolvedSecondPagePager);

      const row = container.querySelector<HTMLElement>(".ui-list__row[data-index='1']");
      assert.ok(row);
      row.dispatchEvent(new MouseEvent("click", { bubbles: true }));

      assert.deepEqual(clicks, [undefined]);
      assert.equal(list.model.isResolved(1), false);
    } finally {
      listener.dispose();
      list.dispose();
      container.remove();
    }
  });

  test("forwards vertical scroll mode to the list view scrollbar", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const list = createPagedList(container, {
      verticalScrollMode: ScrollbarVisibility.Hidden,
    });

    try {
      list.model = new PagedModel(["alpha", "beta"]);

      const track = container.querySelector<HTMLElement>(".scrollAreaTrackY");
      assert.ok(track);
      assert.equal(track.getAttribute("data-scrollbar-visibility"), "hidden");

      list.updateOptions({ verticalScrollMode: ScrollbarVisibility.Visible });
      assert.equal(track.getAttribute("data-scrollbar-visibility"), "visible");
    } finally {
      list.dispose();
      container.remove();
    }
  });
});

const createPagedList = (
  container: HTMLElement,
  options: IPagedListOptions<string> = {},
): PagedList<string> =>
  new PagedList(container, {
    getHeight: () => 24,
    getTemplateId: () => "row",
  }, [textRenderer], options);

const textRenderer: IPagedRenderer<string, HTMLElement> = {
  templateId: "row",
  renderTemplate: container => container,
  renderElement: (item, _index, container) => {
    container.textContent = item;
  },
  renderPlaceholder: (index, container) => {
    container.textContent = `Loading ${index}`;
  },
  disposeTemplate: () => {},
};

const unresolvedSecondPagePager: IPager<string> = {
  firstPage: ["alpha"],
  pageSize: 1,
  total: 2,
  getPage: (_pageIndex: number, _token: CancellationToken) => Promise.resolve(["beta"]),
};

function animationFrame(): Promise<void> {
  return new Promise(resolve => {
    requestAnimationFrame(() => resolve());
  });
}
