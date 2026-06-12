/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import {
  Emitter,
  Event,
} from "src/cs/base/common/event";
import type {
  ISessionService,
  SessionSnapshot,
} from "src/cs/workbench/services/session/common/session";
import type { ITableService } from "src/cs/workbench/services/table/common/table";
import type { SessionChangeEvent } from "src/cs/workbench/services/session/common/sessionEvents";
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
  test("incremental apply uses canonical processed file ids", () => {
    const queuedFileIds: string[][] = [];
    const controller = new TemplateApplyController({
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

  test("manual apply resolves template config and preview cell values", () => {
    const queuedFileIds: string[][] = [];
    const startedJobs: ProcessingJobOptions[] = [];
    const readRows: number[] = [];
    const controller = new TemplateApplyController({
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

  test("removes queued processing files from session removal events", () => {
    const queuedFileIds: string[][] = [];
    const sessionEvents = new Emitter<SessionChangeEvent>();
    const controller = new TemplateApplyController({
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
});

const createSessionFile = (fileId: string) => ({
  file: new File([""], `${fileId}.csv`),
  fileId,
  fileName: `${fileId}.csv`,
});

const createTemplateProcessingBackend = (): TemplateProcessingBackend => ({
  canProcessFile: () => false,
  canReadConvertedCsv: () => false,
  processFile: async () => ({}),
  readConvertedCsv: async () => ({}),
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
): Pick<
  ISessionService,
  | "commitCurves"
  | "commitMetrics"
  | "commitTemplateRun"
  | "getSnapshot"
  | "onDidChangeSession"
> => ({
  commitCurves: () => undefined,
  commitMetrics: () => undefined,
  commitTemplateRun: () => undefined,
  getSnapshot: (): SessionSnapshot => ({
    fileOrder: [],
    filesById: {},
    schemaVersion: 1,
    sessionVersion: 1,
  }),
  onDidChangeSession: sessionEvents?.event ?? Event.None as Event<SessionChangeEvent>,
});

const createTemplateApplyService = (
  queuedFileIds: string[][],
  startedJobs: ProcessingJobOptions[] = [],
  serviceOptions: {
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
  },
  startRuleProcessingJob: () => undefined,
  terminateProcessingWorker: () => undefined,
});
