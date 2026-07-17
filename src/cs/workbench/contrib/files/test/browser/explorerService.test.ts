/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { URI } from "src/cs/base/common/uri";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import { ExplorerService } from "src/cs/workbench/contrib/files/browser/explorerService";
import type { ExplorerSelectionChangeEvent } from "src/cs/workbench/contrib/files/browser/files";

suite("workbench/contrib/files/test/browser/explorerService", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();

  test("owns one Explorer selection", () => {
    const service = store.add(new ExplorerService());
    const events: ExplorerSelectionChangeEvent[] = [];
    const tableResource = URI.file("/workspace/table-a.csv");
    const chartResource = URI.file("/workspace/chart-a.csv");
    const disposable = store.add(service.onDidChangeSelection(event => {
      events.push(event);
    }));

    service.select(tableResource);
    service.select(chartResource);

    assert.equal(service.selectedResource?.toString(), chartResource.toString());
    assert.deepEqual(events.map(event => ({
      selectedResource: event.selectedResource?.toString(),
    })), [
      { selectedResource: tableResource.toString() },
      { selectedResource: chartResource.toString() },
    ]);
    disposable.dispose();
  });

  test("does not emit duplicate selection changes", () => {
    const service = store.add(new ExplorerService());
    let changeCount = 0;
    const disposable = store.add(service.onDidChangeSelection(() => {
      changeCount += 1;
    }));

    const resource = URI.file("/workspace/file-a.csv");
    service.select(resource);
    service.select(resource);

    assert.equal(changeCount, 1);
    disposable.dispose();
  });

  test("returns selected resource identity", () => {
    const service = store.add(new ExplorerService());
    const resourceB = URI.file("/workspace/file-b.csv");
    const resourceC = URI.file("/workspace/file-c.csv");

    const selectedTarget = service.select(resourceB, "force");
    const nextTarget = service.select(resourceC, "force");

    assert.equal(selectedTarget?.resource?.toString(), resourceB.toString());
    assert.equal(nextTarget?.resource?.toString(), resourceC.toString());
    assert.equal(service.selectedResource?.toString(), resourceC.toString());
  });

  test("tracks sheet id as part of explorer selection", () => {
    const service = store.add(new ExplorerService());
    const events: ExplorerSelectionChangeEvent[] = [];
    const resource = URI.file("/workspace/workbook.xlsx");
    const disposable = store.add(service.onDidChangeSelection(event => {
      events.push(event);
    }));

    service.select(resource, undefined, "source-a");
    service.select(resource, undefined, "source-b");
    service.select(resource, undefined, "source-c");

    assert.equal(service.selectedResource?.toString(), resource.toString());
    assert.equal(service.selectedSheetId, "source-c");
    assert.deepEqual(events.map(event => ({
      selectedResource: event.selectedResource?.toString(),
      selectedSheetId: event.selectedSheetId,
    })), [
      { selectedResource: resource.toString(), selectedSheetId: "source-a" },
      { selectedResource: resource.toString(), selectedSheetId: "source-b" },
      { selectedResource: resource.toString(), selectedSheetId: "source-c" },
    ]);
    disposable.dispose();
  });

  test("notifies views with selected resource and sheet id", () => {
    const service = store.add(new ExplorerService());
    const resourceB = URI.file("/workspace/file-b.csv");
    const resourceC = URI.file("/workspace/file-c.csv");
    const viewSelections: Array<{
      readonly reveal: unknown;
      readonly resource: URI | null;
      readonly sheetId: string | null | undefined;
    }> = [];
    const disposable = store.add(service.registerView({
      selectResource: (resource, reveal, sheetId) => {
        viewSelections.push({ resource, reveal, sheetId });
      },
    }));

    service.select(resourceB, "force", "source-b");
    service.select(resourceB, undefined, "source-b");
    service.select(resourceC, "force");

    assert.equal(service.selectedResource?.toString(), resourceC.toString());
    assert.deepEqual(viewSelections.map(selection => ({
      reveal: selection.reveal,
      resource: selection.resource?.toString() ?? null,
      sheetId: selection.sheetId,
    })), [{
      reveal: "force",
      resource: resourceB.toString(),
      sheetId: "source-b",
    }, {
      reveal: "force",
      resource: resourceC.toString(),
      sheetId: null,
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

  test("publishes Explorer context changes", () => {
    const service = store.add(new ExplorerService());
    let changeCount = 0;
    const disposable = store.add(service.onDidChangeContext(() => {
      changeCount += 1;
    }));

    service.setEditable({
      resource: { resource: URI.file("/data/A.csv") },
      isEditing: true,
    });
    service.setEditable(null);

    assert.equal(changeCount, 2);
    disposable.dispose();
  });

  test("reconciles selection with committed files", () => {
    const service = store.add(new ExplorerService());
    const fileA = {
      fileId: "file-a",
      fileName: "A.csv",
      resource: URI.file("/data/A.csv"),
    };
    const fileB = {
      fileId: "file-b",
      fileName: "B.csv",
      resource: URI.file("/data/B.csv"),
    };

    service.replaceFiles([fileA, fileB]);
    assert.equal(service.selectedResource?.toString(), fileA.resource.toString());
    service.select(fileB.resource);
    service.removeFiles(["file-b"]);

    assert.deepEqual(service.files.map(file => file.fileId), ["file-a"]);
    assert.equal(service.selectedResource?.toString(), fileA.resource.toString());
  });

});
