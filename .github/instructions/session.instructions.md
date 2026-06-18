---
description: Session service — canonical records, commit API, snapshots, read models, and change events. Use when working under `src/cs/workbench/services/session`.
applyTo: 'src/cs/workbench/services/session/**'
---
# Session

`SessionService` is the canonical in-memory ledger for the current analysis session.

It is not a view state store and not an orchestration service for every UI action.

## Concepts

| Name | Meaning |
| --- | --- |
| `ISessionService` | Public service interface: snapshot, events, and commit methods. |
| `SessionService` | Browser implementation and only mutator of `SessionModel`. |
| `SessionModel` | Internal canonical data state. |
| `SessionSnapshot` | Read-only data exposed to consumers. |
| `SessionReadModel` | Derived projection for common read patterns. |
| `SessionChangeEvent` | Specific invalidation event after canonical changes. |

## Core files

| File | Responsibility |
| --- | --- |
| `src/cs/workbench/services/session/common/session.ts` | Defines `ISessionService`, `SessionSnapshot`, commit input types, public events. No implementation. |
| `src/cs/workbench/services/session/common/sessionModel.ts` | Defines canonical records: `SessionModel`, `FileRecord`, series, curves, metrics, template run, calculation cache. |
| `src/cs/workbench/services/session/common/sessionEvents.ts` | Defines `SessionChangeEvent`, reasons, affected ids, event helper types. |
| `src/cs/workbench/services/session/common/sessionReadModel.ts` | Builds read-only projections: raw tables by id, assessments, active file fallback, curves by family, metrics by series. No mutation. |
| `src/cs/workbench/services/session/common/sessionModelAdapter.ts` | Temporary compatibility adapter from legacy `SessionFile`/`ProcessedEntry` shapes. Shrink over time. |
| `src/cs/workbench/services/session/browser/sessionService.ts` | Owns mutable model, validates commits, increments versions, emits specific events. |

## Public interface shape

```ts
export interface ISessionService {
  readonly _serviceBrand: undefined;
  readonly onDidChangeSession: Event<SessionChangeEvent>;

  getSnapshot(): SessionSnapshot;

  commitFileImport(result: FileConversionResult): CommitFileImportResult;
  commitRawTableAssessment(result: RawTableAssessmentRecord): void;
  commitTemplateOutput(input: CommitTemplateOutputInput): void;
  commitTemplateOutputs(inputs: readonly CommitTemplateOutputInput[]): void;
  commitTemplateRun(input: CommitTemplateRunInput): void;
  commitCalculatedRecordsBatch(inputs: CommitCalculatedRecordsBatchInput): void;
  commitCurves(input: CommitCurvesInput): void;
  commitCurvesBatch(inputs: readonly CommitCurvesInput[]): void;
  commitMetrics(input: CommitMetricsInput): void;
  commitMetricsBatch(inputs: readonly CommitMetricsInput[]): void;

  renameFile(fileId: FileId, name: string): boolean;
  setMetricInput(input: MetricInputRecord): void;
  clearMetricInput(fileId: FileId, metricKey: MetricKey): void;

  removeFiles(fileIds: readonly FileId[]): void;
  clearSession(): void;
}
```

## Canonical data only

Session may store:

- files and raw tables;
- raw table versions;
- assessment records;
- measurement blocks;
- template run records;
- series;
- curves;
- metrics;
- metric inputs that affect calculation;
- rebuildable calculation cache.

Session must not store:

- `SessionViewState`;
- table selection/focus/scroll;
- chart zoom/legend/popover state;
- active plot tab;
- template form draft state;
- search query;
- export dialog option state;
- worker refs or request ids;
- row cache or thumbnail cache.

## Active target rule

Do not add a global `activeTarget` as the owner of all interactions.

Use service-specific active state:

```txt
Explorer selected resource -> IExplorerService
Table selected cell/range  -> ITableService
Plot active plot type      -> IPlotService
Chart active pane/popover  -> IChartService
Parameters selected metric -> IParametersService
Search selected result     -> ISearchService
Export selected options    -> IExportService
```

Use `CommandTarget` for command arguments.

## Commit rules

- Every canonical mutation goes through `SessionService`.
- Every commit validates affected file/raw table/curve ids.
- File import commits return the actual committed file ids and duplicate source
  ids skipped by Session. Callers may use that result for selection follow-up.
- Assessment commits must check `sourceRawTableVersion`.
- Raw table replacement invalidates stale assessments, template runs, curves, and metrics for that raw table.
- Calculation output that includes derived curves and metrics should use
  `commitCalculatedRecordsBatch` so Session can update both record families in
  one snapshot and emit one `calculatedRecordsChanged` event.
- Events include affected ids; consumers should ignore unrelated changes.

## Command entry and dispatch

`ISessionService` is not a user-workflow dispatcher. Commands may call session commit methods, but only after another service/controller has produced a domain result.

Recommended command boundaries:

| Command | Preferred owner | Session method |
| --- | --- | --- |
| clear session | Explorer or Workbench global command | `ISessionService.clearSession()` |
| remove file/resource | Explorer action/controller after resolving Explorer context | `ISessionService.removeFiles(...)`; call `IExplorerService.select(...)` separately for Explorer selection follow-up |
| commit import | Explorer source workflow/controller after conversion succeeds | `ISessionService.commitFileImport(...)` |
| commit assessment | Assessment contribution/command | `ISessionService.commitRawTableAssessment(...)` |
| commit template/curves | Template service/controller | `ISessionService.commitTemplateOutput(...)` / `commitTemplateOutputs(...)` for produced template output; `commitTemplateRun(...)` and `commitCurves(...)` remain explicit lower-level commits |
| commit calculated curves/metrics | Calculation contribution after pure builders finish | `ISessionService.commitCalculatedRecordsBatch(...)` |
| commit metric input | Parameters service | `ISessionService.setMetricInput(...)` |

Do not add commands that mutate internal `SessionModel` fields directly. Use
explicit commit APIs. Do not make another service fire a submit/request event
only so Workbench can mutate Session; the caller that owns the workflow result
should call `ISessionService`, and consumers should react to the resulting
`SessionChangeEvent`.

## Do not

- Do not expose mutable `SessionModel`.
- Do not let views call internal adapter functions.
- Do not emit `Event<void>` for all changes after migration.
- Do not make `SessionService` call Chart/Table/Template directly.
- Do not store service caches or UI state in `FileRecord`.


## Field catalog

Use `records.instructions.md` for canonical session record field definitions:
`SessionModel`, `FileRecord`, `SeriesRecord`, `CurveRecord`, and
`MetricRecord`.
