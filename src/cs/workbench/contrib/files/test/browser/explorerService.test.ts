/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { ExplorerService } from "src/cs/workbench/contrib/files/browser/explorerService";
import type { ExplorerSelectionChangeEvent } from "src/cs/workbench/contrib/files/browser/files";
import type { ExplorerPaneInput } from "src/cs/workbench/contrib/files/browser/files";

suite("workbench/contrib/files/test/browser/explorerService", () => {
  test("stores raw and analysis selections independently", () => {
    const service = new ExplorerService();
    const events: ExplorerSelectionChangeEvent[] = [];
    const disposable = service.onDidChangeSelection(event => {
      events.push(event);
    });

    service.select({ kind: "raw", fileId: " raw-a " });
    service.select({ kind: "analysis", fileId: "analysis-a" });

    assert.equal(service.selectedRawFileId, "raw-a");
    assert.equal(service.selectedProcessedFileId, "analysis-a");
    assert.deepEqual(events, [
      { kind: "raw", selectedFileId: "raw-a" },
      { kind: "analysis", selectedFileId: "analysis-a" },
    ]);
    disposable.dispose();
  });

  test("does not emit duplicate selection changes", () => {
    const service = new ExplorerService();
    let changeCount = 0;
    const disposable = service.onDidChangeSelection(() => {
      changeCount += 1;
    });

    service.select({ kind: "raw", fileId: "file-a" });
    service.select({ kind: "raw", fileId: " file-a " });

    assert.equal(changeCount, 1);
    disposable.dispose();
  });

  test("selects files through explorer-owned candidate validation", () => {
    const service = new ExplorerService();

    assert.equal(
      service.select({
        candidateFileIds: ["file-a", "file-b"],
        fileId: "file-b",
        kind: "raw",
      }, "force"),
      "file-b",
    );
    assert.equal(
      service.select({
        candidateFileIds: ["file-a"],
        fileId: "file-c",
        kind: "raw",
      }, "force"),
      "file-b",
    );
    assert.equal(service.selectedRawFileId, "file-b");
  });

  test("owns explorer view layout", () => {
    const service = new ExplorerService();
    const layouts: string[] = [];
    const disposable = service.onDidChangeViewLayout(layout => {
      layouts.push(layout);
    });

    assert.equal(service.viewLayout, "tree");

    service.toggleViewLayout();
    service.setViewLayout("thumbnail");
    service.toggleViewLayout();

    assert.equal(service.viewLayout, "tree");
    assert.deepEqual(layouts, ["thumbnail", "tree"]);
    disposable.dispose();
  });

  test("owns expanded folder keys", () => {
    const service = new ExplorerService();
    const events: string[][] = [];
    const disposable = service.onDidChangeExpandedFolderKeys(event => {
      events.push([...event.expandedFolderKeys]);
    });

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

  test("normalizes file removal requests", () => {
    const service = new ExplorerService();
    const removedFileIds: string[] = [];
    const disposable = service.onDidRequestFileRemoval(request => {
      removedFileIds.push(request.fileId);
    });

    service.requestFileRemoval(" file-a ");
    service.requestFileRemoval(" ");

    assert.deepEqual(removedFileIds, ["file-a"]);
    disposable.dispose();
  });

  test("emits folder workflow requests", () => {
    const service = new ExplorerService();
    let importRequests = 0;
    let removalRequests = 0;
    const importListener = service.onDidRequestFolderImport(() => {
      importRequests += 1;
    });
    const removalListener = service.onDidRequestSelectedFolderRemoval(() => {
      removalRequests += 1;
    });

    service.requestFolderImport();
    service.requestSelectedFolderRemoval();

    assert.equal(importRequests, 1);
    assert.equal(removalRequests, 1);
    importListener.dispose();
    removalListener.dispose();
  });

  test("publishes Explorer pane input", () => {
    const service = new ExplorerService();
    const inputs: Array<ExplorerPaneInput | null> = [];
    const disposable = service.onDidChangePaneInput(input => {
      inputs.push(input);
    });
    const input: ExplorerPaneInput = {
      files: [],
      mode: "table",
      onFileImported: () => undefined,
      onFileRemoved: () => undefined,
      onFilesAdded: () => undefined,
      onFilesRemoved: () => undefined,
      onFilesReplaced: () => undefined,
      selectedFileId: null,
      selectionKind: "raw",
      thumbnailFiles: [],
    };

    service.updatePaneInput(input);

    assert.equal(service.getPaneInput(), input);
    assert.deepEqual(inputs, [input]);
    disposable.dispose();
  });
});
