import assert from "assert";

import { Layout } from "../../../../workbench/browser/layout.ts";
import { StorageScope } from "src/cs/platform/storage/common/storage";
import { AbstractStorageService } from "src/cs/platform/storage/common/storageService";
import {
  BrowserWorkbenchLayoutService,
  Parts,
} from "src/cs/workbench/services/layout/browser/layoutService";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

class TestStorageService extends AbstractStorageService {
  private readonly values = new Map<string, string>();

  protected readValue(key: string, scope: StorageScope): string | undefined {
    return this.values.get(this.storageKey(key, scope));
  }

  protected writeValue(key: string, scope: StorageScope, value: string): void {
    this.values.set(this.storageKey(key, scope), value);
  }

  protected deleteValue(key: string, scope: StorageScope): void {
    this.values.delete(this.storageKey(key, scope));
  }

  protected readKeys(scope: StorageScope): string[] {
    const prefix = `${scope}:`;
    const keys: string[] = [];
    for (const key of this.values.keys()) {
      if (key.startsWith(prefix)) {
        keys.push(key.slice(prefix.length));
      }
    }
    return keys;
  }

  private storageKey(key: string, scope: StorageScope): string {
    return `${scope}:${key}`;
  }
}

class RecordingLayout extends Layout {
  public renderCount = 0;

  protected override onDidRenderLayout(): void {
    this.renderCount += 1;
  }
}

const createPart = (id: string): HTMLElement => {
  const element = document.createElement("div");
  element.id = id;
  return element;
};

const timeout = (durationMs: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, durationMs));

suite("workbench/browser/layout", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("keeps overlay child mounted when non-overlay parts change", async () => {
    const parent = document.createElement("div");
    document.body.append(parent);
    const layout = new Layout(parent);

    try {
      const overlay = document.createElement("div");
      const firstController = document.createElement("div");
      layout.setParts({
        controller: firstController,
        overlay,
      });

      const overlayHost = layout.element.querySelector<HTMLElement>(".workbench_layout_overlay");
      assert.ok(overlayHost);
      assert.equal(overlay.parentElement, overlayHost);

      const records: MutationRecord[] = [];
      const observer = new MutationObserver((mutations) => {
        records.push(...mutations);
      });
      observer.observe(overlayHost, { childList: true });

      const secondController = document.createElement("div");
      layout.setParts({
        controller: secondController,
        overlay,
      });
      await Promise.resolve();
      observer.disconnect();

      assert.equal(overlay.parentElement, overlayHost);
      assert.equal(records.length, 0);
    } finally {
      layout.dispose();
      parent.remove();
    }
  });

  test("keeps workbench split mounted when settings is active", () => {
    const parent = document.createElement("div");
    const storage = new TestStorageService();
    const layoutService = new BrowserWorkbenchLayoutService(storage);
    document.body.append(parent);
    const layout = new Layout(parent, layoutService, storage);

    try {
      layout.setParts({
        auxiliaryBar: createPart("auxiliarybar"),
        sidebar: createPart("sidebar"),
        workbench: createPart("workbench"),
      });

      const split = layout.element.querySelector<HTMLElement>(".workbench_layout_split");
      assert.ok(split);

      layoutService.navigateToView("settings");

      assert.equal(
        layout.element.querySelector(".workbench_layout_split"),
        split,
      );
      assert.equal(
        layout.element.querySelector<HTMLElement>(".workbench_layout_shell")
          ?.classList.contains("workbench_layout_shell--hidden"),
        false,
      );
      assert.equal(split.classList.contains("workbench_layout_split--with-auxiliarybar"), true);
      const gridTemplateColumns = split.querySelector<HTMLElement>(".ui-split-view__grid")
        ?.style.gridTemplateColumns ?? "";
      assert.ok(gridTemplateColumns.startsWith("250px"));
      assert.ok(gridTemplateColumns.endsWith("0px"));
      assert.equal(split.classList.contains("workbench_layout_split--animate-sidebar"), false);
      assert.equal(split.classList.contains("workbench_layout_split--animate-auxiliarybar"), false);

      layoutService.navigateToView("table");

      assert.equal(
        layout.element.querySelector(".workbench_layout_split"),
        split,
      );
      assert.equal(split.classList.contains("workbench_layout_split--animate-sidebar"), false);
      assert.equal(split.classList.contains("workbench_layout_split--animate-auxiliarybar"), false);
    } finally {
      layout.dispose();
      layoutService.dispose();
      storage.dispose();
      parent.remove();
    }
  });

  test("hosts sidebar, main, and auxiliary bar as peer split panes", () => {
    const parent = document.createElement("div");
    const storage = new TestStorageService();
    const layoutService = new BrowserWorkbenchLayoutService(storage);
    document.body.append(parent);
    const layout = new Layout(parent, layoutService, storage);

    try {
      layout.setParts({
        auxiliaryBar: createPart("auxiliarybar"),
        sidebar: createPart("sidebar"),
        workbench: createPart("workbench"),
      });

      const grid = layout.element.querySelector<HTMLElement>(
        ".workbench_layout_split > .ui-split-view__viewport > .ui-split-view__grid",
      );
      assert.ok(grid);
      assert.equal(grid.children.length, 3);
      assert.equal(
        Array.from(grid.children).some(child =>
          child.firstElementChild?.classList.contains("workbench_layout_sidebar"),
        ),
        true,
      );
      assert.equal(
        Array.from(grid.children).some(child =>
          child.firstElementChild?.classList.contains("workbench_layout_main"),
        ),
        true,
      );
      assert.equal(
        Array.from(grid.children).some(child =>
          child.firstElementChild?.classList.contains("workbench_layout_auxiliarybar"),
        ),
        true,
      );
    } finally {
      layout.dispose();
      layoutService.dispose();
      storage.dispose();
      parent.remove();
    }
  });

  test("hides auxiliary bar by sizing its peer pane to zero", () => {
    const parent = document.createElement("div");
    const storage = new TestStorageService();
    const layoutService = new BrowserWorkbenchLayoutService(storage);
    document.body.append(parent);
    const layout = new Layout(parent, layoutService, storage);

    try {
      layout.setParts({
        auxiliaryBar: createPart("auxiliarybar"),
        sidebar: createPart("sidebar"),
        workbench: createPart("workbench"),
      });

      const grid = layout.element.querySelector<HTMLElement>(
        ".workbench_layout_split > .ui-split-view__viewport > .ui-split-view__grid",
      );
      assert.ok(grid);

      layoutService.setPartHidden(true, Parts.AUXILIARYBAR_PART);

      assert.equal(
        layout.element.querySelector(".workbench_layout_split > .ui-split-view__viewport > .ui-split-view__grid"),
        grid,
      );
      assert.equal(grid.children.length, 3);
      assert.ok(grid.style.gridTemplateColumns.endsWith("0px"));
      assert.equal(
        layout.element.querySelector<HTMLElement>(".workbench_layout_split")
          ?.classList.contains("workbench_layout_split--animate-auxiliarybar"),
        true,
      );
    } finally {
      layout.dispose();
      layoutService.dispose();
      storage.dispose();
      parent.remove();
    }
  });

  test("keeps workbench part nodes mounted when sidebar visibility changes", () => {
    const parent = document.createElement("div");
    const storage = new TestStorageService();
    const layoutService = new BrowserWorkbenchLayoutService(storage);
    document.body.append(parent);
    const layout = new Layout(parent, layoutService, storage);

    try {
      const auxiliaryBar = createPart("auxiliarybar");
      const sidebar = createPart("sidebar");
      const workbench = createPart("workbench");
      layout.setParts({
        auxiliaryBar,
        sidebar,
        workbench,
      });

      const sidebarHost = layout.element.querySelector<HTMLElement>(".workbench_layout_sidebar");
      const workbenchPane = layout.element.querySelector<HTMLElement>("#workbench-viewpane-main");
      const auxiliaryBarHost = layout.element.querySelector<HTMLElement>(".workbench_layout_auxiliarybar");
      assert.ok(sidebarHost);
      assert.ok(workbenchPane);
      assert.ok(auxiliaryBarHost);
      assert.equal(sidebar.parentElement, sidebarHost);
      assert.equal(workbench.parentElement, workbenchPane);
      assert.equal(auxiliaryBar.parentElement, auxiliaryBarHost);

      layoutService.setPartHidden(true, Parts.SIDEBAR_PART);

      assert.equal(
        layout.element.querySelector<HTMLElement>(".workbench_layout_split")
          ?.classList.contains("workbench_layout_split--animate-sidebar"),
        true,
      );
      assert.equal(
        layout.element.querySelector(".workbench_layout_sidebar"),
        sidebarHost,
      );
      assert.equal(
        layout.element.querySelector("#workbench-viewpane-main"),
        workbenchPane,
      );
      assert.equal(
        layout.element.querySelector(".workbench_layout_auxiliarybar"),
        auxiliaryBarHost,
      );
      assert.equal(sidebar.parentElement, sidebarHost);
      assert.equal(workbench.parentElement, workbenchPane);
      assert.equal(auxiliaryBar.parentElement, auxiliaryBarHost);
    } finally {
      layout.dispose();
      layoutService.dispose();
      storage.dispose();
      parent.remove();
    }
  });

  test("clears sidebar transition class without a second layout render", async () => {
    const parent = document.createElement("div");
    const storage = new TestStorageService();
    const layoutService = new BrowserWorkbenchLayoutService(storage);
    document.body.append(parent);
    const layout = new RecordingLayout(parent, layoutService, storage);

    try {
      layout.setParts({
        auxiliaryBar: createPart("auxiliarybar"),
        sidebar: createPart("sidebar"),
        workbench: createPart("workbench"),
      });
      const renderCountBeforeToggle = layout.renderCount;

      layoutService.setPartHidden(true, Parts.SIDEBAR_PART);

      const split = layout.element.querySelector<HTMLElement>(".workbench_layout_split");
      assert.ok(split);
      assert.equal(split.classList.contains("workbench_layout_split--animate-sidebar"), true);

      const renderCountAfterToggle = layout.renderCount;
      assert.equal(renderCountAfterToggle, renderCountBeforeToggle + 1);

      await timeout(350);

      assert.equal(split.classList.contains("workbench_layout_split--animate-sidebar"), false);
      assert.equal(layout.renderCount, renderCountAfterToggle);
    } finally {
      layout.dispose();
      layoutService.dispose();
      storage.dispose();
      parent.remove();
    }
  });
});
