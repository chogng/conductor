/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import type {
  ISessionService,
  SessionSnapshot,
} from "src/cs/workbench/services/session/common/session";
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
      templateProcessingBackendService: createTemplateProcessingBackend(),
      showResults: () => undefined,
      templateApplyService: createTemplateApplyService(queuedFileIds),
    });

    const config = {
      autoExtractionMode: true,
      stopOnError: false,
    };

    controller.update({
      getTableRow: () => null,
      hasSourceFile: () => true,
      previewFile: null,
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
      templateProcessingBackendService: createTemplateProcessingBackend(),
      showResults: () => undefined,
      templateApplyService: createTemplateApplyService(queuedFileIds, startedJobs),
    });

    controller.update({
      activeFileId: "file-a",
      getTableRow: (rowIndex) => {
        readRows.push(rowIndex);
        return rowIndex === 0 ? ["points", "2"] : null;
      },
      hasSourceFile: () => true,
      previewFile: {
        rowCount: 3,
      },
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

const createSessionService = (): Pick<
  ISessionService,
  "commitCurves" | "commitMetrics" | "commitTemplateRun" | "getSnapshot"
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
});

const createTemplateApplyService = (
  queuedFileIds: string[][],
  startedJobs: ProcessingJobOptions[] = [],
): ITemplateApplyService<
  ProcessingJobOptions,
  RuleProcessingJobOptions,
  TemplateWorkerRef<Worker | null>,
  Worker | null
> => ({
  _serviceBrand: undefined,
  startProcessingJob: (options) => {
    queuedFileIds.push(options.queue.map((entry) => entry.fileId));
    startedJobs.push(options);
  },
  startRuleProcessingJob: () => undefined,
  terminateProcessingWorker: () => undefined,
});
