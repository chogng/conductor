---
description: Calculation domain - pure algorithms, derived records, metric generation, cache policy, and session commit boundaries.
applyTo: 'src/cs/workbench/services/calculation/**'
---
# Calculation

Calculation owns reusable analysis algorithms and pure projection helpers over
Session facts. It is not Plot, Parameters, Chart, Table, or Session UI.

## Ownership

Calculation owns:

- first-pass and second-pass numerical algorithms;
- calculation result builders from `FileRecord` inputs;
- metric builders from base curves and metric inputs;
- input signatures and cache policy helpers;
- `ICalculationService` queue/lifecycle for reruns, interactive priority hints, worker execution, and Session commits of calculated records.

Calculation does not own plot display state, chart panes, parameter panel UI,
Session internals, table-fact production, template extraction, raw parsing, or
table preview state.

## Core Files

| File | Responsibility |
| --- | --- |
| `common/calculation.ts` | `ICalculationService` contract and shared exports. |
| `common/calculationTypes.ts` | pure value types. |
| `common/calculationExecutor.ts` | pure algorithm dispatcher. |
| `common/calculationRecordBuilder.ts` | facade for calculated curve/metric commit payloads. |
| `common/calculationCurveRecordBuilder.ts` | derived and second-derived `CurveRecord` builders. |
| `common/calculationMetricRecordBuilder.ts` | `MetricRecord` builders from base curves/metric inputs. |
| `common/calculationReadModel.ts` | derived read models and retired-payload compatibility projections. |
| `common/calculationCacheAccess.ts` / `calculationCachePolicy.ts` | cache access/invalidation/retention. |
| `common/gm.ts`, `ss.ts`, `vth.ts`, `ionIoff.ts`, `sweepSegmentation.ts` | focused algorithm families/helpers. |
| `browser/calculationService.ts` | service owner: signatures, pending queue, priority lane, worker chunks, Session commits. |
| `browser/calculationWorker.ts` / `calculationWorkerClient.ts` | worker entry/adapter, request identity, timeout, fallback. |
| `browser/calculation.contribution.ts` | service registration only. |

## Flow

```txt
SessionChangeEvent / SessionSnapshot
  -> ICalculationService checks affected files and input signatures
  -> queue reordered by interactive priority lane
  -> calculation worker builds curves/metrics from slim per-file input
  -> service verifies current signature
  -> ISessionService.commitCalculatedRecordsBatch(...)
  -> downstream consumers reread Session
```

## Update Triggers

- Rerun on `sliceRunChanged`, `filesRemoved`, `sessionCleared`, and
  `metricInputsChanged`.
- Rerun on `curvesChanged` only when base curves changed.
- Do not rerun on derived/second-derived curve commits, calculated record commits, metric commits, raw table changes, or table-fact changes unless they become calculation inputs.
- When `fileIds` are available, recompute only those files.
- `filesRemoved` and `sessionCleared` prune per-file signatures instead of recommitting unrelated files.

## Session And Worker Rules

- Read Session only through `ISessionService.getSnapshot()`.
- Write canonical results only through Session commit APIs.
- `calculationService.ts` owns lifecycle/queue glue; algorithm and record-building logic belongs in `common/*`.
- Worker payloads include only what is required: base curves, matching series,
  metric inputs, latest `SliceRun` template metadata, and minimal raw file
  identity.
- Do not send raw table rows, table-fact state, or full snapshots to the worker.
- Worker results must be checked against per-file input signatures; session version alone is not enough.
- Interactive foreground and background work share one calculation worker slot to bound CPU pressure.
- `prioritizeCalculationFile(s)` is a priority hint only: reorder pending work and optionally process a tiny current-file chunk. Do not enqueue unchanged or unrelated files.
- Second-derived curves are calculated from first-pass derived curves in memory during the same pass; do not commit/read-back just to compute the second pass.
- Calculation never calls Plot, Parameters, Export, Search, Chart, or Table directly.

## Field Catalog

Use `records.instructions.md` for `CurveRecord`, `MetricRecord`,
`CalculationCacheRecord`, `CalculatedData`, `CalculatedSeries`, and
`CalculatedPoint`.

## Do Not

- Do not put DOM, services, or command registration in pure helpers.
- Do not mutate `SessionModel` internals.
- Do not import plot rendering helpers or chart DOM.
- Do not own parameter view state.
- Do not let calculated output invalidate itself.
