/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import { ExplorerService } from "src/cs/workbench/contrib/files/browser/explorerService";
import type {
  ExplorerPaneInput,
  ExplorerSelectionChangeEvent,
  ExplorerSelectionTarget,
} from "src/cs/workbench/contrib/files/browser/files";

suite("workbench/contrib/files/test/browser/explorerService", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();

  test("shares explorer selection between table and chart", () => {
    const service = store.add(new ExplorerService());
    const events: ExplorerSelectionChangeEvent[] = [];
    const disposable = store.add(service.onDidChangeSelection(event => {
      events.push(event);
    }));

    service.select({ kind: "table", fileId: " table-a " });
    service.select({ kind: "chart", fileId: "chart-a" });

    assert.equal(service.selectedRawFileId, "chart-a");
    assert.equal(service.selectedProcessedFileId, "chart-a");
    assert.deepEqual(events, [
      { kind: "table", selectedFileId: "table-a" },
      { kind: "chart", selectedFileId: "chart-a" },
    ]);
    disposable.dispose();
  });

  test("does not emit duplicate selection changes", () => {
    const service = store.add(new ExplorerService());
    let changeCount = 0;
    const disposable = store.add(service.onDidChangeSelection(() => {
      changeCount += 1;
    }));

    service.select({ kind: "table", fileId: "file-a" });
    service.select({ kind: "table", fileId: " file-a " });

    assert.equal(changeCount, 1);
    disposable.dispose();
  });

  test("selects files through explorer-owned candidate validation", () => {
    const service = store.add(new ExplorerService());

    assert.equal(
      service.select({
        candidateFileIds: ["file-a", "file-b"],
        fileId: "file-b",
        kind: "table",
      }, "force"),
      "file-b",
    );
    assert.equal(
      service.select({
        candidateFileIds: ["file-a"],
        fileId: "file-c",
        kind: "table",
      }, "force"),
      "file-b",
    );
    assert.equal(service.selectedRawFileId, "file-b");
  });

  test("tracks item key as part of explorer selection", () => {
    const service = store.add(new ExplorerService());
    const events: ExplorerSelectionChangeEvent[] = [];
    const disposable = store.add(service.onDidChangeSelection(event => {
      events.push(event);
    }));

    service.select({
      candidateFileIds: ["file-a"],
      candidateItemKeys: ["source-a", "source-b"],
      fileId: "file-a",
      kind: "table",
      itemKey: "source-a",
    });
    service.select({
      candidateFileIds: ["file-a"],
      candidateItemKeys: ["source-a", "source-b"],
      fileId: "file-a",
      kind: "table",
      itemKey: "source-b",
    });
    service.select({
      candidateFileIds: ["file-a"],
      candidateItemKeys: ["source-a", "source-b"],
      fileId: "file-a",
      kind: "table",
      itemKey: "source-c",
    });

    assert.equal(service.selectedRawFileId, "file-a");
    assert.equal(service.selectedRawItemKey, "source-b");
    assert.deepEqual(events, [
      { kind: "table", selectedFileId: "file-a", selectedItemKey: "source-a" },
      { kind: "table", selectedFileId: "file-a", selectedItemKey: "source-b" },
    ]);
    disposable.dispose();
  });

  test("notifies views only with accepted selection targets", () => {
    const service = store.add(new ExplorerService());
    const viewSelections: Array<{
      readonly reveal: unknown;
      readonly target: ExplorerSelectionTarget;
    }> = [];
    const disposable = store.add(service.registerView({
      selectResource: (target, reveal) => {
        viewSelections.push({ reveal, target });
      },
    }));

    service.select({
      candidateFileIds: ["file-b"],
      fileId: " file-b ",
      kind: "table",
    }, "force");
    service.select({
      candidateFileIds: ["file-b"],
      fileId: "file-b",
      kind: "table",
    });
    service.select({
      candidateFileIds: ["file-a"],
      fileId: "file-c",
      kind: "table",
    }, "force");

    assert.equal(service.selectedRawFileId, "file-b");
    assert.deepEqual(viewSelections, [{
      reveal: "force",
      target: {
        candidateFileIds: ["file-b"],
        fileId: "file-b",
        kind: "table",
      },
    }]);
    disposable.dispose();
  });

  test("owns explorer view layout", () => {
    const service = store.add(new ExplorerService());
    const layouts: string[] = [];
    const disposable = store.add(service.onDidChangeViewLayout(layout => {
      layouts.push(layout);
    }));

    assert.equal(service.viewLayout, "tree");

    service.toggleViewLayout();
    service.setViewLayout("thumbnail");
    service.toggleViewLayout();

    assert.equal(service.viewLayout, "tree");
    assert.deepEqual(layouts, ["thumbnail", "tree"]);
    disposable.dispose();
  });

  test("owns expanded folder keys", () => {
    const service = store.add(new ExplorerService());
    const events: string[][] = [];
    const disposable = store.add(service.onDidChangeExpandedFolderKeys(event => {
      events.push([...event.expandedFolderKeys]);
    }));

    assert.deepEqual(
      service.reconcileExpandedFolderKeys(["folder:a", "folder:b"]),
      ["folder:a", "folder:b"],
    );
    service.setExpandedFolderKeys(["folder:b"]);

    assert.deepEqual(service.expandedFolderKeys, ["folder:b"]);
    assert.deepEqual(
      service.getCollapsedFolderKeys(["folder:a", "folder:b"]),
      ["folder:a"],
    );
    assert.deepEqual(
      service.reconcileExpandedFolderKeys(["folder:a", "folder:b", "folder:c"]),
      ["folder:b", "folder:c"],
    );
    assert.deepEqual(events, [
      ["folder:a", "folder:b"],
      ["folder:b"],
      ["folder:b", "folder:c"],
    ]);
    disposable.dispose();
  });

  test("publishes Explorer pane input", () => {
    const service = store.add(new ExplorerService());
    let changeCount = 0;
    const disposable = store.add(service.onDidChangePaneInput(() => {
      changeCount += 1;
    }));
    const input: ExplorerPaneInput = {
      files: [],
      mode: "table",
      selectedFileId: null,
      selectionKind: "table",
      thumbnailFiles: [],
    };

    service.updatePaneInput(input);
    service.updatePaneInput({
      files: [],
      mode: "table",
      selectedFileId: null,
      selectionKind: "table",
      thumbnailFiles: [],
    });

    assert.equal(service.getPaneInput(), input);
    assert.equal(changeCount, 1);
    disposable.dispose();
  });

});
