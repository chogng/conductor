---
description: Calculation domain - URI-backed derived records, metric generation, cache policy, and worker lifecycle.
applyTo: 'src/cs/workbench/services/calculation/**'
---
# Calculation

Calculation owns reusable analysis algorithms and resource-scoped calculated
results. It is not Plot, Parameters, Chart, Table, or Session UI.

## Ownership

Calculation owns:

- first-pass and second-pass numerical algorithms;
- calculation result builders from Slice base-curve inputs;
- metric builders from base curves and metric inputs;
- input signatures and cache policy helpers;
- `ICalculationService` queue/lifecycle for resource reruns, interactive priority
  hints, worker execution, stale-result checks, and resource result caching.

Calculation does not own plot display state, chart panes, parameter panel UI,
Session internals, table-model production, template extraction, raw parsing, or
table preview state.

## Core Files

| File | Responsibility |
| --- | --- |
| `common/calculation.ts` | `ICalculationService` contract and shared exports. |
| `common/calculationRecords.ts` | resource-neutral calculation input, curve, metric, series, and axis records. |
| `common/calculationTypes.ts` | pure value types. |
| `common/calculationExecutor.ts` | pure algorithm dispatcher. |
| `common/calculationRecordBuilder.ts` | facade for calculated curve/metric result records. |
| `common/calculationCurveRecordBuilder.ts` | derived and second-derived `CurveRecord` builders. |
| `common/calculationMetricRecordBuilder.ts` | `MetricRecord` builders from base curves/metric inputs. |
| `common/calculationReadModel.ts` | derived read models and source-normalization projections. |
| `common/calculationCacheAccess.ts` / `calculationCachePolicy.ts` | cache access/invalidation/retention. |
| `common/gm.ts`, `ss.ts`, `vth.ts`, `ionIoff.ts`, `sweepSegmentation.ts` | focused algorithm families/helpers. |
| `browser/calculationService.ts` | service owner: resource signatures, pending queue, worker execution, and result cache. |
| `browser/calculationWorker.ts` / `calculationWorkerClient.ts` | worker entry/adapter, request identity, timeout, fallback. |
| `browser/calculation.contribution.ts` | service registration only. |

## Flow

```txt
SliceResourceResult for { resource, sheetId? }
  -> ICalculationService checks the resource input signature
  -> queue reordered by resource priority
  -> calculation worker builds curves/metrics from a slim calculation input
  -> service verifies current signature
  -> CalculationResourceResult cached by { resource, sheetId? }
  -> Plot / Parameters reread ICalculationService
```

## Update Triggers

- A resource is calculated only after `prioritizeResource(resource, sheetId)`.
- A changed or removed `SliceResourceResult` invalidates only the matching
  resource/sheet result.
- Previously requested resources are recalculated after their Slice input
  changes.
- Repeated priorities with the same input signature do not enqueue duplicate
  work.

## Resource And Worker Rules

- Resource identity is `{ resource: URI, sheetId? }`; do not introduce a
  parallel calculation file-id identity.
- Calculation record builders consume one resource-neutral
  `CalculationRecordsInput`; do not recreate Session `FileRecord`,
  `filesById` / `fileOrder`, or synthetic file-id batching for URI work.
- `CalculationResourceResult` owns `resource` / `sheetId` once at the result
  boundary. Nested series, curves, metrics, lineage, and curve refs must not
  repeat that identity as `fileId`.
- Read base curves and source versions through `ISliceService.getResourceResult()`.
- Keep calculated curves and metrics in `CalculationResourceResult`; do not
  commit them into Session.
- `calculationService.ts` owns lifecycle/queue glue; algorithm and record-building logic belongs in `common/*`.
- Worker payloads include only base curves, matching series, axis projection,
  metric inputs when present, and request/input signatures.
- Do not send raw table rows, table-model state, Session snapshots, or
  `SessionModel` records to the worker.
- Worker results must be checked against the current resource input signature
  and request id.
- Resource work shares one calculation worker slot to bound CPU pressure.
- `prioritizeResource` is a priority hint and calculation trigger; do not
  enqueue unchanged or unrelated resources.
- Second-derived curves are calculated from first-pass derived curves in memory during the same pass; do not commit/read-back just to compute the second pass.
- Calculation never calls Plot, Parameters, Export, Search, Chart, or Table directly.

## Do Not

- Do not put DOM, services, or command registration in pure helpers.
- Do not read or mutate Session to transport URI-backed calculation results.
- Do not import plot rendering helpers or chart DOM.
- Do not own parameter view state.
- Do not let calculated output invalidate itself.
