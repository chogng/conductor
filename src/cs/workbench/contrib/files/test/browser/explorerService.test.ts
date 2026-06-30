/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { URI } from "src/cs/base/common/uri";
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
    const tableResource = URI.file("/workspace/table-a.csv");
    const chartResource = URI.file("/workspace/chart-a.csv");
    const disposable = store.add(service.onDidChangeSelection(event => {
      events.push(event);
    }));

    service.select({ kind: "table", resource: tableResource });
    service.select({ kind: "chart", resource: chartResource });

    assert.equal(service.selectedResource?.toString(), chartResource.toString());
    assert.deepEqual(events.map(event => ({
      kind: event.kind,
      selectedResource: event.selectedResource?.toString(),
    })), [
      { kind: "table", selectedResource: tableResource.toString() },
      { kind: "chart", selectedResource: chartResource.toString() },
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
    service.select({ kind: "table", resource });
    service.select({ kind: "table", resource });

    assert.equal(changeCount, 1);
    disposable.dispose();
  });

  test("selects resources through explorer-owned candidate validation", () => {
    const service = store.add(new ExplorerService());
    const resourceA = URI.file("/workspace/file-a.csv");
    const resourceB = URI.file("/workspace/file-b.csv");
    const resourceC = URI.file("/workspace/file-c.csv");

    const acceptedTarget = service.select({
      candidateResources: [{ resource: resourceA }, { resource: resourceB }],
      kind: "table",
      resource: resourceB,
    }, "force");
    const rejectedTarget = service.select({
      candidateResources: [{ resource: resourceA }],
      kind: "table",
      resource: resourceC,
    }, "force");

    assert.equal(acceptedTarget?.resource?.toString(), resourceB.toString());
    assert.equal(rejectedTarget?.resource?.toString(), resourceB.toString());
    assert.equal(service.selectedResource?.toString(), resourceB.toString());
  });

  test("tracks sheet id as part of explorer selection", () => {
    const service = store.add(new ExplorerService());
    const events: ExplorerSelectionChangeEvent[] = [];
    const resource = URI.file("/workspace/workbook.xlsx");
    const disposable = store.add(service.onDidChangeSelection(event => {
      events.push(event);
    }));

    service.select({
      candidateResources: [{ resource, sheetId: "source-a" }, { resource, sheetId: "source-b" }],
      kind: "table",
      resource,
      sheetId: "source-a",
    });
    service.select({
      candidateResources: [{ resource, sheetId: "source-a" }, { resource, sheetId: "source-b" }],
      kind: "table",
      resource,
      sheetId: "source-b",
    });
    service.select({
      candidateResources: [{ resource, sheetId: "source-a" }, { resource, sheetId: "source-b" }],
      kind: "table",
      resource,
      sheetId: "source-c",
    });

    assert.equal(service.selectedResource?.toString(), resource.toString());
    assert.equal(service.selectedSheetId, "source-b");
    assert.deepEqual(events.map(event => ({
      kind: event.kind,
      selectedResource: event.selectedResource?.toString(),
      selectedSheetId: event.selectedSheetId,
    })), [
      { kind: "table", selectedResource: resource.toString(), selectedSheetId: "source-a" },
      { kind: "table", selectedResource: resource.toString(), selectedSheetId: "source-b" },
    ]);
    disposable.dispose();
  });

  test("notifies views only with accepted selection targets", () => {
    const service = store.add(new ExplorerService());
    const resourceA = URI.file("/workspace/file-a.csv");
    const resourceB = URI.file("/workspace/file-b.csv");
    const resourceC = URI.file("/workspace/file-c.csv");
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
      candidateResources: [{ resource: resourceB }],
      kind: "table",
      resource: resourceB,
    }, "force");
    service.select({
      candidateResources: [{ resource: resourceB }],
      kind: "table",
      resource: resourceB,
    });
    service.select({
      candidateResources: [{ resource: resourceA }],
      kind: "table",
      resource: resourceC,
    }, "force");

    assert.equal(service.selectedResource?.toString(), resourceB.toString());
    assert.deepEqual(viewSelections.map(selection => ({
      reveal: selection.reveal,
      target: {
        ...selection.target,
        candidateResources: selection.target.candidateResources?.map(target => ({
          resource: target.resource?.toString() ?? null,
          sheetId: target.sheetId,
        })),
        resource: selection.target.resource?.toString() ?? null,
      },
    })), [{
      reveal: "force",
      target: {
        candidateResources: [{ resource: resourceB.toString(), sheetId: undefined }],
        kind: "table",
        resource: resourceB.toString(),
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
      mode: "table",
      selectedResource: null,
      selectedSheetId: null,
      selectionKind: "table",
    };

    service.updatePaneInput(input);
    service.updatePaneInput({
      mode: "table",
      selectedResource: null,
      selectedSheetId: null,
      selectionKind: "table",
    });

    assert.equal(service.getPaneInput(), input);
    assert.equal(changeCount, 1);
    disposable.dispose();
  });

  test("publishes Explorer pane input when resource state targets change", () => {
    const service = store.add(new ExplorerService());
    let changeCount = 0;
    const disposable = store.add(service.onDidChangePaneInput(() => {
      changeCount += 1;
    }));
    service.updatePaneInput({
      mode: "table",
      resourceStates: [{ resource: URI.file("/data/A.csv"), sheetId: "sheet-a", chartState: "ready", hasChartData: true }],
      selectedResource: URI.file("/data/A.csv"),
      selectedSheetId: "sheet-a",
      selectionKind: "table",
    });
    service.updatePaneInput({
      mode: "table",
      resourceStates: [{ resource: URI.file("/data/A.csv"), sheetId: "sheet-a", chartState: "ready", hasChartData: true }],
      selectedResource: URI.file("/data/A.csv"),
      selectedSheetId: "sheet-a",
      selectionKind: "table",
    });
    service.updatePaneInput({
      mode: "table",
      resourceStates: [{ resource: URI.file("/data/B.csv"), sheetId: "sheet-a", chartState: "ready", hasChartData: true }],
      selectedResource: URI.file("/data/A.csv"),
      selectedSheetId: "sheet-a",
      selectionKind: "table",
    });
    service.updatePaneInput({
      mode: "table",
      resourceStates: [{ resource: URI.file("/data/B.csv"), sheetId: "sheet-b", chartState: "ready", hasChartData: true }],
      selectedResource: URI.file("/data/A.csv"),
      selectedSheetId: "sheet-a",
      selectionKind: "table",
    });

    assert.equal(changeCount, 3);
    disposable.dispose();
  });

  test("keeps committed files separate from resource state projection", () => {
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
    service.updatePaneInput({
      mode: "table",
      selectedResource: null,
      selectedSheetId: null,
      selectionKind: "table",
    });
    service.updatePaneInput({
      mode: "chart",
      resourceStates: [{ resource: fileA.resource, chartState: "ready", hasChartData: true }],
      selectedResource: null,
      selectedSheetId: null,
      selectionKind: "chart",
    });

    assert.deepEqual(service.files.map(file => file.fileId), ["file-a", "file-b"]);
    assert.deepEqual(service.getPaneInput()?.resourceStates?.map(state => state.resource.toString()), [fileA.resource.toString()]);
  });

});
