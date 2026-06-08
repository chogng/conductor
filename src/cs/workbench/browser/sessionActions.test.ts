import assert from "assert";

import { createSessionActions } from "src/cs/workbench/browser/sessionActions";
import { SessionService } from "src/cs/workbench/services/session/browser/sessionService";
import { createNoneTarget } from "src/cs/workbench/services/session/common/sessionModel";
import type { SessionFile } from "src/cs/workbench/services/session/common/sessionTypes";

suite("workbench/browser/sessionActions", () => {
  test("replacing imported files selects the first file and starts preview loading", () => {
    const session = new SessionService();
    const importedFile: SessionFile = {
      file: {},
      fileId: "file-a",
      fileName: "Transfer.csv",
      normalizedCsvPath: "C:/tmp/transfer.csv",
      sourceKey: "transfer.csv::24::123",
      rowCount: 2,
      columnCount: 2,
    };
    let invalidated = 0;
    let resetPreviewWorkerCount = 0;
    let resetProcessingWorkerCount = 0;

    const actions = createSessionActions({
      addRawFiles: session.addRawFiles,
      clearPreviewState: () => undefined,
      clearSessionData: session.clearSessionData,
      disposePreviewFileCache: () => undefined,
      invalidatePreviewRequests: () => {
        invalidated += 1;
      },
      previewFile: null,
      previewLoadingMessage: "Loading preview...",
      rawFiles: [],
      removeFiles: session.removeFiles,
      removeQueuedProcessingFile: () => undefined,
      replaceRawFiles: session.replaceRawFiles,
      resetPreviewWorker: () => {
        resetPreviewWorkerCount += 1;
      },
      resetProcessingWorker: () => {
        resetProcessingWorkerCount += 1;
      },
      runInBatch: session.batch,
      activeTarget: createNoneTarget(),
      setActiveTarget: session.setActiveTarget,
      setPreviewStatus: session.setPreviewStatus,
    });

    actions.handleFilesReplaced([importedFile]);

    const snapshot = session.getSnapshot();
    assert.deepEqual(snapshot.fileOrder, ["file-a"]);
    assert.deepEqual(snapshot.activeTarget, { kind: "file", fileId: "file-a" });
    assert.equal(snapshot.viewState.table?.previewStatus?.state, "loading");
    assert.equal(snapshot.viewState.table?.previewStatus?.message, "Loading preview...");
    assert.equal(invalidated, 2);
    assert.equal(resetPreviewWorkerCount, 1);
    assert.equal(resetProcessingWorkerCount, 1);
  });

  test("adding imported files selects the first file when no target is active", () => {
    const session = new SessionService();
    const importedFile: SessionFile = {
      file: {},
      fileId: "file-a",
      fileName: "Transfer.csv",
      rowCount: 2,
      columnCount: 2,
    };
    let invalidated = 0;

    const actions = createSessionActions({
      addRawFiles: session.addRawFiles,
      clearPreviewState: () => undefined,
      clearSessionData: session.clearSessionData,
      disposePreviewFileCache: () => undefined,
      invalidatePreviewRequests: () => {
        invalidated += 1;
      },
      previewFile: null,
      previewLoadingMessage: "Loading preview...",
      rawFiles: [],
      removeFiles: session.removeFiles,
      removeQueuedProcessingFile: () => undefined,
      replaceRawFiles: session.replaceRawFiles,
      resetPreviewWorker: () => undefined,
      resetProcessingWorker: () => undefined,
      runInBatch: session.batch,
      activeTarget: createNoneTarget(),
      setActiveTarget: session.setActiveTarget,
      setPreviewStatus: session.setPreviewStatus,
    });

    actions.handleFilesAdded([importedFile]);

    const snapshot = session.getSnapshot();
    assert.deepEqual(snapshot.fileOrder, ["file-a"]);
    assert.deepEqual(snapshot.activeTarget, { kind: "file", fileId: "file-a" });
    assert.equal(snapshot.viewState.table?.previewStatus?.state, "loading");
    assert.equal(invalidated, 1);
  });
});
