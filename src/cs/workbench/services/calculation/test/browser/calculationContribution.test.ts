/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { Emitter, type Event } from "src/cs/base/common/event";
import {
  CalculationContribution,
  shouldUpdateCalculationForSessionChange,
} from "src/cs/workbench/services/calculation/browser/calculation.contribution";
import type {
  CommitCurvesBatchInput,
  CommitCurvesInput,
  CommitMetricsBatchInput,
  CommitMetricsInput,
  ISessionService,
  SessionSnapshot,
} from "src/cs/workbench/services/session/common/session";
import {
  createSessionChangeEvent,
  type SessionChangeEvent,
  type SessionChangeReason,
} from "src/cs/workbench/services/session/common/sessionEvents";
import type {
  BaseCurveKey,
  CurveKey,
  FileRecord,
} from "src/cs/workbench/services/session/common/sessionModel";

suite("workbench/services/calculation/test/browser/calculationContribution", () => {
  test("ignores session changes that do not affect calculated curve inputs", () => {
    for (const reason of [
      "rawTablesChanged",
      "assessmentChanged",
      "metricsChanged",
    ] satisfies SessionChangeReason[]) {
      assert.equal(
        shouldUpdateCalculationForSessionChange(createSessionChangeEvent(reason, 1)),
        false,
        reason,
      );
    }
  });

  test("updates for template, removal, and clear changes", () => {
    for (const reason of [
      "templateRunChanged",
      "filesRemoved",
      "sessionCleared",
      "metricInputsChanged",
    ] satisfies SessionChangeReason[]) {
      assert.equal(
        shouldUpdateCalculationForSessionChange(createSessionChangeEvent(reason, 1)),
        true,
        reason,
      );
    }
  });

  test("updates only for base curve changes", () => {
    assert.equal(
      shouldUpdateCalculationForSessionChange(createSessionChangeEvent("curvesChanged", 1, {
        curveKeys: ["base:iv:transfer:series-a" as CurveKey],
      })),
      true,
    );
    assert.equal(
      shouldUpdateCalculationForSessionChange(createSessionChangeEvent("curvesChanged", 1, {
        curveKeys: ["derived:gm:default:series-a" as CurveKey],
      })),
      false,
    );
    assert.equal(
      shouldUpdateCalculationForSessionChange(createSessionChangeEvent("curvesChanged", 1, {
        curveKeys: ["secondDerived:secondDerivative:default:series-a" as CurveKey],
      })),
      false,
    );
  });

  test("updates for curve replacement events without committed curve keys", () => {
    assert.equal(
      shouldUpdateCalculationForSessionChange(createSessionChangeEvent("curvesChanged", 1)),
      true,
    );
  });

  test("recalculates only files affected by a base curve session change", () => {
    const sessionEvents = new Emitter<SessionChangeEvent>();
    const curveCommits: CommitCurvesInput[] = [];
    const metricCommits: CommitMetricsInput[] = [];
    let snapshot = createSnapshot({
      "file-a": createFileRecord("file-a", "series-a", "base-a"),
      "file-b": createFileRecord("file-b", "series-b", "base-b"),
    });
    const contribution = new CalculationContribution(createSessionServiceStub({
      commitCurvesBatch: input => curveCommits.push(...input),
      commitMetricsBatch: input => metricCommits.push(...input),
      getSnapshot: () => snapshot,
      onDidChangeSession: sessionEvents.event,
    }));
    curveCommits.length = 0;
    metricCommits.length = 0;

    snapshot = createSnapshot({
      "file-a": createFileRecord("file-a", "series-a", "base-a"),
      "file-b": createFileRecord("file-b", "series-b", "base-b-next"),
    });
    sessionEvents.fire(createSessionChangeEvent("curvesChanged", 2, {
      curveKeys: ["base:iv:transfer:series-b" as CurveKey],
      fileIds: ["file-b"],
    }));

    assert.deepEqual(curveCommits.map(commit => commit.fileId), ["file-b"]);
    assert.deepEqual(metricCommits.map(commit => commit.fileId), ["file-b"]);
    contribution.dispose();
    sessionEvents.dispose();
  });
});

const createSessionServiceStub = ({
  commitCurvesBatch,
  commitMetricsBatch,
  getSnapshot,
  onDidChangeSession,
}: {
  readonly commitCurvesBatch: (input: CommitCurvesBatchInput) => void;
  readonly commitMetricsBatch: (input: CommitMetricsBatchInput) => void;
  readonly getSnapshot: () => SessionSnapshot;
  readonly onDidChangeSession: Event<SessionChangeEvent>;
}): ISessionService => ({
  _serviceBrand: undefined,
  clearMetricInput: () => undefined,
  clearSession: () => undefined,
  commitFileImport: () => ({
    importedFileIds: [],
    skippedDuplicateFileIds: [],
  }),
  commitCurves: () => undefined,
  commitCurvesBatch,
  commitMetrics: () => undefined,
  commitMetricsBatch,
  commitRawTableAssessment: () => undefined,
  commitRawTableAssessments: () => undefined,
  commitTemplateOutput: () => undefined,
  commitTemplateOutputs: () => undefined,
  commitTemplateRun: () => undefined,
  getSnapshot,
  onDidChangeSession,
  renameFile: () => false,
  removeFiles: () => undefined,
  setMetricInput: () => undefined,
});

const createSnapshot = (
  filesById: Record<string, FileRecord>,
): SessionSnapshot => ({
  fileOrder: Object.keys(filesById),
  filesById,
  schemaVersion: 1,
  sessionVersion: 1,
});

const createFileRecord = (
  fileId: string,
  seriesId: string,
  signature: string,
): FileRecord => {
  const curveKey = `base:iv:transfer:${seriesId}` as BaseCurveKey;
  return {
    assessmentsByRawTableId: {},
    curvesByKey: {
      [curveKey]: {
        curveFamily: "iv",
        curveGeneration: "base",
        fileId,
        ivMode: "transfer",
        lineage: {
          baseFamily: "iv",
          baseSeries: { fileId, seriesId },
          curveGeneration: "base",
          ivMode: "transfer",
        },
        points: [
          { x: 0, y: 1 },
          { x: 1, y: 2 },
          { x: 2, y: 4 },
        ],
        seriesId,
        signature,
      },
    },
    id: fileId,
    kind: "unknown",
    latestTemplateRunId: "run-a",
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
    seriesById: {
      [seriesId]: {
        fileId,
        groupIndex: 0,
        id: seriesId,
        name: seriesId,
        y: [1, 2, 4],
      },
    },
    seriesOrder: [seriesId],
    templateRunsById: {
      "run-a": {
        appliedAt: 1,
        config: {
          bottomTitle: "Gate Voltage",
          leftTitle: "Drain Current",
          stopOnError: false,
          xDataEnd: 2,
          xDataStart: 0,
          xSegmentationMode: "auto",
          xUnit: "V",
          yColumns: [1],
          yLegendTarget: "auto",
          yUnit: "A",
        },
        configFingerprint: "config-a",
        errors: [],
        fileId,
        id: "run-a",
        mode: "auto",
        outputCurveKeys: [curveKey],
        outputSeriesIds: [seriesId],
        selection: { kind: "auto" },
        sourceBlockIds: [],
        warnings: [],
      },
    },
  };
};
