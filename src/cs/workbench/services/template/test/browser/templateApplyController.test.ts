/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import {
  Emitter,
  Event,
} from "src/cs/base/common/event";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import type {
  CommitTemplateOutputInput,
  ISessionService,
  SessionSnapshot,
} from "src/cs/workbench/services/session/common/session";
import type { ITableService } from "src/cs/workbench/services/table/common/table";
import type { SessionChangeEvent } from "src/cs/workbench/services/session/common/sessionEvents";
import type {
  ProcessingStatus,
  SessionFile,
} from "src/cs/workbench/services/session/common/sessionTypes";
import type { ITemplateApplyService } from "src/cs/workbench/services/template/common/template";
import {
  TemplateApplyController,
} from "src/cs/workbench/services/template/browser/templateApplyController";
import type {
  ProcessingJobOptions,
  RuleProcessingJobOptions,
  TemplateWorkerRef,
} from "src/cs/workbench/services/template/browser/templateApplyProcessing";
import type {
  TemplateProcessingBackend,
} from "src/cs/workbench/services/template/common/templateProcessingBackend";

suite("workbench/services/template/browser/templateApplyController", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  const createController = (
    options: ConstructorParameters<typeof TemplateApplyController>[0],
  ): TemplateApplyController => store.add(new TemplateApplyController(options));

  test("incremental apply uses canonical processed file ids", () => {
    const queuedFileIds: string[][] = [];
    const controller = createController({
      sessionService: createSessionService(),
      tableService: createTableService(),
      templateProcessingBackendService: createTemplateProcessingBackend(),
      showResults: () => undefined,
      templateApplyService: createTemplateApplyService(queuedFileIds),
    });

    const config = {
      autoExtractionMode: true,
      stopOnError: false,
    };

    controller.update({
      processedFileIds: ["file-a", "file-c"],
      rawFiles: [
        createSessionFile("file-a"),
        createSessionFile("file-b"),
        createSessionFile("file-c"),
      ],
    });

    controller.handleTemplateApplied(config);
    const result = controller.handleTemplateAppliedIncremental(config);

    assert.equal(result.ok, true);
    assert.deepEqual(queuedFileIds, [
      ["file-a", "file-b", "file-c"],
      ["file-b"],
    ]);
  });

  test("full apply starts with the active file", () => {
    const queuedFileIds: string[][] = [];
    const controller = createController({
      sessionService: createSessionService(),
      tableService: createTableService(),
      templateProcessingBackendService: createTemplateProcessingBackend(),
      showResults: () => undefined,
      templateApplyService: createTemplateApplyService(queuedFileIds),
    });

    controller.update({
      activeFileId: "file-b",
      processedFileIds: [],
      rawFiles: [
        createSessionFile("file-a"),
        createSessionFile("file-b"),
        createSessionFile("file-c"),
      ],
    });

    const result = controller.handleTemplateApplied({
      autoExtractionMode: true,
      stopOnError: false,
    }) as { ok: boolean };

    assert.equal(result.ok, true);
    assert.deepEqual(queuedFileIds, [["file-b", "file-a", "file-c"]]);
    controller.dispose();
  });

  test("interactive priority moves a queued processing file forward", () => {
    const queuedFileIds: string[][] = [];
    const startedJobs: ProcessingJobOptions[] = [];
    const controller = createController({
      sessionService: createSessionService(),
      tableService: createTableService(),
      templateProcessingBackendService: createTemplateProcessingBackend(),
      showResults: () => undefined,
      templateApplyService: createTemplateApplyService(queuedFileIds, startedJobs, {
        markProcessing: true,
      }),
    });

    controller.update({
      processedFileIds: [],
      rawFiles: [
        createSessionFile("file-a"),
        createSessionFile("file-b"),
        createSessionFile("file-c"),
      ],
    });
    controller.handleTemplateApplied({
      autoExtractionMode: true,
      stopOnError: false,
    });

    controller.prioritizeProcessingFile("file-c");

    assert.deepEqual(
      startedJobs[0].processingQueueRef.current.map(entry => entry.fileId),
      ["file-c", "file-a", "file-b"],
    );
    controller.dispose();
  });

  test("interactive priority keeps recently selected queued files ahead of background work", () => {
    const queuedFileIds: string[][] = [];
    const startedJobs: ProcessingJobOptions[] = [];
    const controller = createController({
      sessionService: createSessionService(),
      tableService: createTableService(),
      templateProcessingBackendService: createTemplateProcessingBackend(),
      showResults: () => undefined,
      templateApplyService: createTemplateApplyService(queuedFileIds, startedJobs, {
        markProcessing: true,
      }),
    });

    controller.update({
      processedFileIds: [],
      rawFiles: [
        createSessionFile("file-a"),
        createSessionFile("file-b"),
        createSessionFile("file-c"),
        createSessionFile("file-d"),
      ],
    });
    controller.handleTemplateApplied({
      autoExtractionMode: true,
      stopOnError: false,
    });

    controller.prioritizeProcessingFile("file-c");
    controller.prioritizeProcessingFile("file-b");

    assert.deepEqual(
      startedJobs[0].processingQueueRef.current.map(entry => entry.fileId),
      ["file-b", "file-c", "file-a", "file-d"],
    );
    controller.dispose();
  });

  test("full apply queues converted csv sources without retained File objects", () => {
    const queuedFileIds: string[][] = [];
    const startedJobs: ProcessingJobOptions[] = [];
    const controller = createController({
      sessionService: createSessionService(),
      tableService: createTableService(),
      templateProcessingBackendService: createTemplateProcessingBackend({
        canReadConvertedCsv: () => true,
      }),
      showResults: () => undefined,
      templateApplyService: createTemplateApplyService(queuedFileIds, startedJobs),
    });

    controller.update({
      processedFileIds: [],
      rawFiles: [
        createSessionFile("file-path", {
          file: undefined,
          normalizedCsvPath: "C:/tmp/file-path.csv",
        }),
      ],
    });

    const result = controller.handleTemplateApplied({
      autoExtractionMode: true,
      stopOnError: false,
    }) as { ok: boolean };

    assert.equal(result.ok, true);
    assert.deepEqual(queuedFileIds, [["file-path"]]);
    assert.equal(startedJobs[0].queue[0].file, undefined);
    assert.equal(startedJobs[0].queue[0].normalizedCsvPath, "C:/tmp/file-path.csv");
    controller.dispose();
  });

  test("browser full apply skips converted csv sources when no readable File is retained", () => {
    const queuedFileIds: string[][] = [];
    const startedJobs: ProcessingJobOptions[] = [];
    const controller = createController({
      sessionService: createSessionService(),
      tableService: createTableService(),
      templateProcessingBackendService: createTemplateProcessingBackend(),
      showResults: () => undefined,
      templateApplyService: createTemplateApplyService(queuedFileIds, startedJobs),
    });

    controller.update({
      processedFileIds: [],
      rawFiles: [
        createSessionFile("file-path", {
          file: undefined,
          normalizedCsvPath: "C:/tmp/file-path.csv",
        }),
      ],
    });

    const result = controller.handleTemplateApplied({
      autoExtractionMode: true,
      stopOnError: false,
    }) as { ok: boolean };

    assert.equal(result.ok, false);
    assert.deepEqual(queuedFileIds, []);
    assert.equal(startedJobs.length, 0);
    assert.equal(controller.getFileApplyStates().get("file-path")?.state, "skipped");
    controller.dispose();
  });

  test("rule apply starts with the active file's matched group", () => {
    const queuedFileIds: string[][] = [];
    const controller = createController({
      sessionService: createSessionService(),
      tableService: createTableService(),
      templateProcessingBackendService: createTemplateProcessingBackend(),
      showResults: () => undefined,
      templateApplyService: createTemplateApplyService(queuedFileIds),
    });

    controller.update({
      activeFileId: "file-b",
      processedFileIds: [],
      rawFiles: [
        createSessionFile("file-a", { fileName: "Transfer_Device.csv" }),
        createSessionFile("file-b", { fileName: "Output_Device.csv" }),
        createSessionFile("file-c", { fileName: "Transfer_Second.csv" }),
      ],
    });

    const result = controller.handleTemplateApplied({
      fileNameTemplateRules: [
        {
          matchMode: "phrase",
          pattern: "Transfer",
          templateConfig: createManualTemplateConfig(),
          templateName: "Transfer Template",
        },
        {
          matchMode: "phrase",
          pattern: "Output",
          templateConfig: createManualTemplateConfig(),
          templateName: "Output Template",
        },
      ],
      stopOnError: false,
    }) as { ok: boolean };

    assert.equal(result.ok, true);
    assert.deepEqual(queuedFileIds, [["file-b", "file-a", "file-c"]]);
    controller.dispose();
  });

  test("active file changes move queued processing work forward", () => {
    const queuedFileIds: string[][] = [];
    const startedJobs: ProcessingJobOptions[] = [];
    const controller = createController({
      sessionService: createSessionService(),
      tableService: createTableService(),
      templateProcessingBackendService: createTemplateProcessingBackend(),
      showResults: () => undefined,
      templateApplyService: createTemplateApplyService(queuedFileIds, startedJobs),
    });
    const rawFiles = [
      createSessionFile("file-a"),
      createSessionFile("file-b"),
      createSessionFile("file-c"),
    ];

    controller.update({
      activeFileId: "file-a",
      processedFileIds: [],
      rawFiles,
    });
    controller.handleTemplateApplied({
      autoExtractionMode: true,
      stopOnError: false,
    });

    startedJobs[0].processingQueueRef.current = [
      startedJobs[0].queue[1],
      startedJobs[0].queue[2],
    ];
    startedJobs[0].setProcessingStatus({
      processed: 0,
      state: "processing",
      total: 3,
    });
    controller.update({
      activeFileId: "file-c",
      processedFileIds: [],
      rawFiles,
    });

    assert.deepEqual(
      startedJobs[0].processingQueueRef.current.map(entry => entry.fileId),
      ["file-c", "file-b"],
    );
    controller.dispose();
  });

  test("manual apply resolves template config and preview cell values", () => {
    const queuedFileIds: string[][] = [];
    const startedJobs: ProcessingJobOptions[] = [];
    const readRows: number[] = [];
    const controller = createController({
      sessionService: createSessionService(),
      tableService: createTableService({
        getRow: (rowIndex) => {
          readRows.push(rowIndex);
          return rowIndex === 0 ? ["points", "2"] : null;
        },
        previewFile: {
          rowCount: 3,
        },
      }),
      templateProcessingBackendService: createTemplateProcessingBackend(),
      showResults: () => undefined,
      templateApplyService: createTemplateApplyService(queuedFileIds, startedJobs),
    });

    controller.update({
      processedFileIds: [],
      rawFiles: [createSessionFile("file-a")],
    });

    const result = controller.handleTemplateApplied({
      bottomTitle: "Vg",
      leftTitle: "Id",
      legendPrefix: "",
      name: "Manual Transfer",
      stopOnError: false,
      xDataEnd: "A3",
      xDataStart: "A2",
      xPointsPerGroup: "B1",
      xSegmentCount: "",
      xSegmentationMode: "points",
      xUnit: "V",
      yColumns: [1],
      yLegendCount: "",
      yLegendStart: "",
      yLegendStep: "",
      yLegendTarget: "auto",
      yUnit: "A",
    });

    assert.equal(result.ok, true);
    assert.deepEqual(queuedFileIds, [["file-a"]]);
    assert.deepEqual(readRows, [0]);
    assert.equal(startedJobs.length, 1);

    const extractionConfig = startedJobs[0].extractionConfig as Record<string, unknown>;
    assert.equal(extractionConfig.xCol, 0);
    assert.equal(extractionConfig.startRow, 1);
    assert.equal(extractionConfig.endRow, 2);
    assert.equal(extractionConfig.xSegmentationMode, "points");
    assert.deepEqual(extractionConfig.yCols, [1]);
    assert.deepEqual(extractionConfig.groupSizeCell, {
      colIndex: 1,
      rowIndex: 0,
    });
    assert.equal(extractionConfig.bottomTitle, "Vg");
    assert.equal(extractionConfig.leftTitle, "Id");
    assert.equal(extractionConfig.xUnit, "V");
    assert.equal(extractionConfig.yUnit, "A");
  });

  test("manual apply queues files that need template review or have weak assessment", () => {
    const queuedFileIds: string[][] = [];
    const controller = createController({
      sessionService: createSessionService(),
      tableService: createTableService(),
      templateProcessingBackendService: createTemplateProcessingBackend(),
      showResults: () => undefined,
      templateApplyService: createTemplateApplyService(queuedFileIds),
    });

    controller.update({
      processedFileIds: [],
      rawFiles: [
        createSessionFile("file-needs-template", {
          curveTypeNeedsTemplate: true,
        }),
        createSessionFile("file-low-confidence", {
          curveTypeConfidence: "low",
        }),
        createSessionFile("file-unknown", {
          curveType: "unknown",
          curveTypeConfidence: "medium",
          xAxisRole: null,
        }),
      ],
    });

    const result = controller.handleTemplateApplied(createManualTemplateConfig()) as { ok: boolean };

    assert.equal(result.ok, true);
    assert.deepEqual(queuedFileIds, [[
      "file-needs-template",
      "file-low-confidence",
      "file-unknown",
    ]]);
    controller.dispose();
  });

  test("removes queued processing files from session removal events", () => {
    const queuedFileIds: string[][] = [];
    const sessionEvents = new Emitter<SessionChangeEvent>();
    const controller = createController({
      sessionService: createSessionService(sessionEvents),
      tableService: createTableService(),
      templateProcessingBackendService: createTemplateProcessingBackend(),
      showResults: () => undefined,
      templateApplyService: createTemplateApplyService(queuedFileIds, [], {
        markProcessing: true,
      }),
    });

    controller.update({
      processedFileIds: [],
      rawFiles: [
        createSessionFile("file-a"),
        createSessionFile("file-b"),
      ],
    });

    controller.handleTemplateApplied({
      autoExtractionMode: true,
      stopOnError: false,
    });
    sessionEvents.fire({
      fileIds: ["file-b"],
      reason: "filesRemoved",
      sessionVersion: 2,
    });

    assert.deepEqual(queuedFileIds, [["file-a", "file-b"]]);
    assert.deepEqual(controller.processingStatus, {
      processed: 0,
      state: "processing",
      total: 1,
    });
    controller.dispose();
    sessionEvents.dispose();
  });

  test("clears apply state when an active processing file is removed", () => {
    const queuedFileIds: string[][] = [];
    const startedJobs: ProcessingJobOptions[] = [];
    const sessionEvents = new Emitter<SessionChangeEvent>();
    const controller = createController({
      sessionService: createSessionService(sessionEvents),
      tableService: createTableService(),
      templateProcessingBackendService: createTemplateProcessingBackend(),
      showResults: () => undefined,
      templateApplyService: createTemplateApplyService(queuedFileIds, startedJobs, {
        markProcessing: true,
      }),
    });

    controller.update({
      processedFileIds: [],
      rawFiles: [
        createSessionFile("file-a"),
        createSessionFile("file-b"),
      ],
    });

    controller.handleTemplateApplied({
      autoExtractionMode: true,
      stopOnError: false,
    });
    startedJobs[0].processingQueueRef.current = [startedJobs[0].queue[1]];
    sessionEvents.fire({
      fileIds: ["file-a"],
      reason: "filesRemoved",
      sessionVersion: 2,
    });

    assert.equal(controller.getFileApplyStates().has("file-a"), false);
    assert.equal(controller.getFileApplyStates().get("file-b")?.state, "queued");
    controller.dispose();
    sessionEvents.dispose();
  });

  test("full apply rejects while extraction is already running", () => {
    const queuedFileIds: string[][] = [];
    const controller = createController({
      sessionService: createSessionService(),
      tableService: createTableService(),
      templateProcessingBackendService: createTemplateProcessingBackend(),
      showResults: () => undefined,
      templateApplyService: createTemplateApplyService(queuedFileIds, [], {
        markProcessing: true,
      }),
    });

    controller.update({
      processedFileIds: [],
      rawFiles: [createSessionFile("file-a")],
    });
    controller.handleTemplateApplied({
      autoExtractionMode: true,
      stopOnError: false,
    });
    const result = controller.handleTemplateApplied({
      autoExtractionMode: true,
      stopOnError: false,
    }) as { ok: boolean };

    assert.equal(result.ok, false);
    assert.deepEqual(queuedFileIds, [["file-a"]]);
    controller.dispose();
  });

  test("full apply rejects while source files are still importing", () => {
    const queuedFileIds: string[][] = [];
    const controller = createController({
      sessionService: createSessionService(),
      tableService: createTableService(),
      templateProcessingBackendService: createTemplateProcessingBackend(),
      showResults: () => undefined,
      templateApplyService: createTemplateApplyService(queuedFileIds),
    });

    controller.update({
      hasPendingSourceFiles: true,
      processedFileIds: [],
      rawFiles: [createSessionFile("file-a")],
    });
    const result = controller.handleTemplateApplied({
      autoExtractionMode: true,
      stopOnError: false,
    }) as { ok: boolean };

    assert.equal(result.ok, false);
    assert.deepEqual(queuedFileIds, []);
    controller.dispose();
  });

  test("incremental apply rejects while source files are still importing", () => {
    const queuedFileIds: string[][] = [];
    const controller = createController({
      sessionService: createSessionService(),
      tableService: createTableService(),
      templateProcessingBackendService: createTemplateProcessingBackend(),
      showResults: () => undefined,
      templateApplyService: createTemplateApplyService(queuedFileIds),
    });

    const config = {
      autoExtractionMode: true,
      stopOnError: false,
    };

    controller.update({
      hasPendingSourceFiles: false,
      processedFileIds: [],
      rawFiles: [createSessionFile("file-a")],
    });
    controller.handleTemplateApplied(config);
    controller.update({
      hasPendingSourceFiles: true,
      processedFileIds: ["file-a"],
      rawFiles: [
        createSessionFile("file-a"),
        createSessionFile("file-b"),
      ],
    });
    const result = controller.handleTemplateAppliedIncremental(config) as { ok: boolean };

    assert.equal(result.ok, false);
    assert.deepEqual(queuedFileIds, [["file-a"]]);
    controller.dispose();
  });

  test("full apply skips files that need template review", () => {
    const queuedFileIds: string[][] = [];
    const controller = createController({
      sessionService: createSessionService(),
      tableService: createTableService(),
      templateProcessingBackendService: createTemplateProcessingBackend(),
      showResults: () => undefined,
      templateApplyService: createTemplateApplyService(queuedFileIds),
    });

    controller.update({
      processedFileIds: [],
      rawFiles: [
        createSessionFile("file-a"),
        createSessionFile("file-b", {
          curveType: "unknown",
          curveTypeConfidence: "medium",
          curveTypeNeedsTemplate: true,
          xAxisRole: null,
        }),
      ],
    });
    const result = controller.handleTemplateApplied({
      autoExtractionMode: true,
      stopOnError: false,
    }) as { message: string; ok: boolean };

    assert.equal(result.ok, true);
    assert.match(result.message, /template\.apply\.skippedAssessmentFiles/);
    assert.deepEqual(queuedFileIds, [["file-a"]]);
    controller.dispose();
  });

  test("fires processing status changes for bridge consumers", () => {
    const queuedFileIds: string[][] = [];
    const startedJobs: ProcessingJobOptions[] = [];
    const statuses: ProcessingStatus[] = [];
    const controller = createController({
      sessionService: createSessionService(),
      tableService: createTableService(),
      templateProcessingBackendService: createTemplateProcessingBackend(),
      showResults: () => undefined,
      templateApplyService: createTemplateApplyService(queuedFileIds, startedJobs),
    });
    const disposable = controller.onDidChangeProcessingStatus(status => {
      statuses.push(status);
    });

    controller.update({
      processedFileIds: [],
      rawFiles: [createSessionFile("file-a")],
    });
    controller.handleTemplateApplied({
      autoExtractionMode: true,
      stopOnError: false,
    });
    startedJobs[0].setProcessingStatus({
      processed: 0,
      state: "processing",
      total: 1,
    });
    startedJobs[0].setProcessingStatus({
      processed: 1,
      state: "done",
      total: 1,
    });

    assert.deepEqual(statuses, [
      {
        processed: 0,
        state: "processing",
        total: 1,
      },
      {
        processed: 1,
        state: "done",
        total: 1,
      },
    ]);
    disposable.dispose();
    controller.dispose();
  });

  test("batches template output commits on the next turn", async () => {
    const queuedFileIds: string[][] = [];
    const committedBatches: CommitTemplateOutputInput[][] = [];
    let snapshot = createTemplateOutputSnapshot(["file-a", "file-b"]);
    const controller = createController({
      sessionService: createSessionService(undefined, {
        commitTemplateOutputs: commits => {
          committedBatches.push(commits);
          snapshot = {
            ...snapshot,
            sessionVersion: snapshot.sessionVersion + 1,
          };
        },
        getSnapshot: () => snapshot,
      }),
      tableService: createTableService(),
      templateProcessingBackendService: createTemplateProcessingBackend(),
      showResults: () => undefined,
      templateApplyService: createTemplateApplyService(queuedFileIds, [], {
        commitProcessedEntries: true,
      }),
    });

    controller.update({
      processedFileIds: [],
      rawFiles: [
        createSessionFile("file-a"),
        createSessionFile("file-b"),
      ],
    });
    controller.handleTemplateApplied({
      autoExtractionMode: true,
      stopOnError: false,
    });

    assert.equal(committedBatches.length, 0);
    await waitForTemplateOutputFlush();

    assert.equal(committedBatches.length, 1);
    assert.deepEqual(committedBatches[0].map(commit => commit.curves.fileId), ["file-a", "file-b"]);
    controller.dispose();
  });

  test("publishes per-file apply states from plan and commits", async () => {
    const queuedFileIds: string[][] = [];
    let snapshot = createTemplateOutputSnapshot(["file-a", "file-b"]);
    const changedFileIds: readonly string[][] = [];
    const controller = createController({
      sessionService: createSessionService(undefined, {
        commitTemplateOutputs: () => {
          snapshot = {
            ...snapshot,
            sessionVersion: snapshot.sessionVersion + 1,
          };
        },
        getSnapshot: () => snapshot,
      }),
      tableService: createTableService(),
      templateProcessingBackendService: createTemplateProcessingBackend(),
      showResults: () => undefined,
      templateApplyService: createTemplateApplyService(queuedFileIds, [], {
        commitProcessedEntries: true,
      }),
    });
    const disposable = controller.onDidChangeFileStates(fileIds => {
      changedFileIds.push(fileIds);
    });

    controller.update({
      processedFileIds: [],
      rawFiles: [
        createSessionFile("file-a"),
        createSessionFile("file-b", {
          curveTypeConfidence: "low",
        }),
      ],
    });
    controller.handleTemplateApplied({
      autoExtractionMode: true,
      stopOnError: false,
    });

    assert.equal(controller.getFileApplyStates().get("file-a")?.state, "ready");
    assert.equal(controller.getFileApplyStates().get("file-b")?.state, "skipped");
    assert.deepEqual(changedFileIds.flat(), ["file-a", "file-b", "file-a"]);
    disposable.dispose();
    controller.dispose();
  });

  test("rule apply marks unmatched files skipped instead of queued", () => {
    const queuedFileIds: string[][] = [];
    const controller = createController({
      sessionService: createSessionService(),
      tableService: createTableService(),
      templateProcessingBackendService: createTemplateProcessingBackend(),
      showResults: () => undefined,
      templateApplyService: createTemplateApplyService(queuedFileIds),
    });

    controller.update({
      processedFileIds: [],
      rawFiles: [
        createSessionFile("file-a", { fileName: "Match_Device.csv" }),
        createSessionFile("file-b", { fileName: "Other_Device.csv" }),
      ],
    });

    const result = controller.handleTemplateApplied({
      fileNameTemplateRules: [{
        matchMode: "phrase",
        pattern: "Match",
        templateConfig: createManualTemplateConfig(),
        templateName: "Matched Template",
      }],
      stopOnError: false,
    }) as { ok: boolean };

    assert.equal(result.ok, true);
    assert.deepEqual(queuedFileIds, [["file-a"]]);
    assert.equal(controller.getFileApplyStates().get("file-a")?.state, "queued");
    const unmatchedState = controller.getFileApplyStates().get("file-b");
    assert.equal(unmatchedState?.state, "skipped");
    assert.equal(unmatchedState?.state === "skipped" ? unmatchedState.code : null, "noMatchingRule");
    controller.dispose();
  });

  test("drops pending template output commits from stale jobs", async () => {
    const queuedFileIds: string[][] = [];
    const startedJobs: ProcessingJobOptions[] = [];
    const committedBatches: CommitTemplateOutputInput[][] = [];
    const snapshot = createTemplateOutputSnapshot(["file-a"]);
    const controller = createController({
      sessionService: createSessionService(undefined, {
        commitTemplateOutputs: commits => {
          committedBatches.push(commits);
        },
        getSnapshot: () => snapshot,
      }),
      tableService: createTableService(),
      templateProcessingBackendService: createTemplateProcessingBackend(),
      showResults: () => undefined,
      templateApplyService: createTemplateApplyService(queuedFileIds, startedJobs),
    });

    controller.update({
      processedFileIds: [],
      rawFiles: [createSessionFile("file-a")],
    });
    controller.handleTemplateApplied({
      autoExtractionMode: true,
      stopOnError: false,
    });

    startedJobs[0].commitTemplateOutput({
      curveType: "transfer",
      fileId: "file-a",
      fileName: "file-a.csv",
      series: [{
        groupIndex: 0,
        id: "file-a-series",
        y: [1],
      }],
      xGroups: [[0]],
    }, undefined, 999);
    await waitForTemplateOutputFlush();

    assert.deepEqual(committedBatches, []);
    controller.dispose();
  });
});

const createSessionFile = (
  fileId: string,
  overrides: Partial<SessionFile> = {},
) => ({
  ...createSessionFileBase(fileId),
  ...overrides,
});

const createSessionFileBase = (fileId: string) => ({
  curveType: "transfer",
  curveTypeConfidence: "high" as const,
  curveTypeNeedsTemplate: false,
  file: new File([""], `${fileId}.csv`),
  fileId,
  fileName: `${fileId}.csv`,
  xAxisRole: "vg" as const,
  xAxisRoleSource: "metadata" as const,
});

const createManualTemplateConfig = (): Record<string, unknown> => ({
  bottomTitle: "Vg",
  leftTitle: "Id",
  legendPrefix: "",
  name: "Manual Transfer",
  stopOnError: false,
  xDataEnd: "A3",
  xDataStart: "A2",
  xPointsPerGroup: "",
  xSegmentCount: "",
  xSegmentationMode: "points",
  xUnit: "V",
  yColumns: [1],
  yLegendCount: "",
  yLegendStart: "",
  yLegendStep: "",
  yLegendTarget: "auto",
  yUnit: "A",
});

const createTemplateProcessingBackend = (
  overrides: Partial<TemplateProcessingBackend> = {},
): TemplateProcessingBackend => ({
  canProcessFile: () => false,
  canReadConvertedCsv: () => false,
  processFile: async () => ({}),
  readConvertedCsv: async () => ({}),
  ...overrides,
});

const createTableService = ({
  getRow = () => null,
  previewFile = null,
}: {
  readonly getRow?: (rowIndex: number) => unknown;
  readonly previewFile?: unknown;
} = {}): Pick<ITableService, "getViewInput"> => ({
  getViewInput: () => ({
    tableModel: {
      getRow,
      getState: () => ({ file: previewFile }),
    },
  } as ReturnType<ITableService["getViewInput"]>),
});

const createSessionService = (
  sessionEvents?: Emitter<SessionChangeEvent>,
  overrides: Partial<Pick<
    ISessionService,
    | "commitTemplateOutputs"
    | "getSnapshot"
  >> = {},
): Pick<
  ISessionService,
  | "commitTemplateOutputs"
  | "commitTemplateRun"
  | "getSnapshot"
  | "onDidChangeSession"
> => ({
  commitTemplateOutputs: () => undefined,
  commitTemplateRun: () => undefined,
  getSnapshot: (): SessionSnapshot => ({
    fileOrder: [],
    filesById: {},
    schemaVersion: 1,
    sessionVersion: 1,
  }),
  onDidChangeSession: sessionEvents?.event ?? Event.None as Event<SessionChangeEvent>,
  ...overrides,
});

const createTemplateApplyService = (
  queuedFileIds: string[][],
  startedJobs: ProcessingJobOptions[] = [],
  serviceOptions: {
    readonly commitProcessedEntries?: boolean;
    readonly markProcessing?: boolean;
  } = {},
): ITemplateApplyService<
  ProcessingJobOptions,
  RuleProcessingJobOptions,
  TemplateWorkerRef<Worker | null>,
  Worker | null
> => ({
  _serviceBrand: undefined,
  startProcessingJob: (jobOptions) => {
    queuedFileIds.push(jobOptions.queue.map((entry) => entry.fileId));
    startedJobs.push(jobOptions);
    if (serviceOptions.markProcessing) {
      jobOptions.processingQueueRef.current = [...jobOptions.queue];
      jobOptions.setProcessingStatus({
        processed: 0,
        state: "processing",
        total: jobOptions.queue.length,
      });
    }
    if (serviceOptions.commitProcessedEntries) {
      for (const entry of jobOptions.queue) {
        jobOptions.commitTemplateOutput({
          curveType: "transfer",
          fileId: entry.fileId,
          fileName: entry.fileName,
          series: [{
            groupIndex: 0,
            id: `${entry.fileId}-series`,
            y: [1],
          }],
          xGroups: [[0]],
        });
      }
    }
  },
  startRuleProcessingJob: (jobOptions) => {
    queuedFileIds.push(jobOptions.finalQueue.map((entry) => entry.fileId));
  },
  terminateProcessingWorker: () => undefined,
});

const createTemplateOutputSnapshot = (fileIds: readonly string[]): SessionSnapshot => ({
  fileOrder: [...fileIds],
  filesById: Object.fromEntries(fileIds.map(fileId => [fileId, {
    assessmentsByRawTableId: {},
    curvesByKey: {},
    id: fileId,
    kind: "csv",
    measurementBlockOrder: [],
    measurementBlocksById: {},
    metricsByKey: {},
    name: `${fileId}.csv`,
    raw: {
      fileId,
      fileName: `${fileId}.csv`,
      tableOrder: [],
      tablesById: {},
    },
    rawTableVersionsById: {},
    seriesById: {},
    seriesOrder: [],
    templateRunsById: {},
  }])),
  schemaVersion: 1,
  sessionVersion: 1,
});

const waitForTemplateOutputFlush = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 80));
