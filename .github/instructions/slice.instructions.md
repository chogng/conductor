---
description: Slice service - executes canonical Template snapshots into SliceRun, series, and base curves.
applyTo: 'src/cs/workbench/services/slice/**,src/cs/workbench/contrib/slice/**'
---
# Slice

Slice is the execution owner for concrete reviewed or manual `Template`
snapshots. It does not classify raw data, interpret Recipes, review template
quality, or decide whether the system should apply a template.

## Ownership

`ISliceService` owns:

- per-file `TemplateSelection` state;
- `SliceRequest` queue entries from ReviewApply or user commands;
- slice file state, priority, cancellation, and queue draining;
- calling the planner/executor and committing `SliceCommit` through Session.

`SlicePlanner` owns deterministic plan creation from immutable inputs:
`Template`, raw table dimensions, source versions, and Template-provided
measurement bindings. It must not read rows, start workers, or mutate Session.

`SliceExecutor` owns execution of a `SlicePlan` against supplied rows and
returns a `SliceCommit`. It must not call services or reread Session.

## Core Files

| File | Responsibility |
| --- | --- |
| `common/slice.ts` | service contract, `SliceRequest`, `SliceRun`, `SlicePlan`, commit/state/input types. |
| `common/templateSelection.ts` | per-file `TemplateSelection` records, the automatic-selection sentinel, and normalization helpers owned by Slice state. |
| `common/slicePlanner.ts` | pure plan/range generation and migration source/table-fact signature helpers. |
| `common/sliceExecutor.ts` | pure row execution into `SliceCommit`. |
| `browser/sliceService.ts` | injectable owner for queue, selection, progress state, row reading, and Session commit. |
| `../review/browser/reviewApply.contribution.ts` | lifecycle bridge from `reviewChanged` system recommendations to Slice requests. |
| `browser/slicePriority.contribution.ts` | lifecycle subscriber from Explorer selection/hover facts to `ISliceService.prioritize(...)`. |
| `contrib/slice/browser/sliceCommands.ts` / `sliceActions.ts` | command/action entry for user-triggered slicing; normalizes targets and delegates to `ISliceService`. |

## Flow

```txt
Session reviewChanged
  -> ReviewApplyContribution rereads SessionSnapshot
  -> ReviewDecision.ready + application.systemRecommended
  -> idempotency/staleness guard
  -> ISliceService.submit(SliceRequest[])
  -> SliceService reads reviewed Template snapshot from request
  -> SlicePlanner.createSlicePlan(...)
  -> SliceService verifies source version, review/request/template fingerprints
  -> RawTableRowsReader reads rows
  -> SliceService verifies the same plan signatures again
  -> SliceExecutor.executeSlicePlan(...)
  -> ISessionService.commitSliceRuns(...)
  -> Session sliceRunChanged
```

Manual flow:

```txt
files.item.setTemplate command
  -> ISliceService.setTemplateSelection(fileId, selection)
  -> SliceState.templateSelectionsByFileId

command/action/controller
  -> ReviewService.reviewManualTemplate(...)
  -> ready ManualTemplateReviewResult
  -> ISliceService.submit(SliceRequest(trigger = userCommand))
  -> SliceService reads reviewed inline/saved Template snapshot
  -> same planner/executor/commit path
```

Bulk command flow:

```txt
slice.runWithTemplate / slice.runWithTemplateIncremental command
  -> collect RawTableRef targets from SessionSnapshot
  -> review selected Template through Review
  -> ISliceService.submit(...) for each ready target
```

Priority flow:

```txt
Explorer selection / hover event
  -> SlicePriorityContribution
  -> ISliceService.prioritize(fileId)
```

Cleanup flow:

```txt
Session filesRemoved
  -> SliceService removes matching queue entries, file states, selections, active file

Session sessionCleared
  -> SliceService clears queue, file states, selections, active file
```

Explorer projection:

```txt
RawTableReviewRecord + SliceState.fileStates + latest SliceRun
  -> WorkbenchDomainBridge / ExplorerPaneInput
  -> rawTableStatus + chartState + chartMessage
```

## Rules

- Slice consumes reviewed Template snapshots; it must not detect headers, roles,
  family, or mode from raw rows.
- Automatic execution consumes `ReviewDecision.ready.reviewedTemplate` and
  executes that stored Template snapshot.
- Manual execution must first produce a `ManualTemplateReviewResult.ready`
  value. Compatibility adapters may convert historical/manual presets into
  canonical `Template` snapshots before review.
- `Template` coordinates are raw-table relative. Runtime provenance belongs to
  `SlicePlan.inputRanges` and `SliceRun.inputRanges`.
- `commitSliceRuns(...)` is the Session boundary. Do not commit run, series, and
  curves through separate Session calls.
- Slice queue entries must be dropped as stale if their source raw table
  version, review signature, request signature, or reviewed-template
  fingerprint changes before commit.
- Contributions only subscribe and delegate. They do not plan, execute, read
  rows, or commit Session.
- Slice commands may collect stable `RawTableRef` command targets from
  `SessionSnapshot`, but must not read rows, plan, execute, or commit Session.

## Do Not

- Do not interpret raw rows/header semantics here; Recipe projection and
  Template materialization happen before Review/Slice.
- Do not re-run table-fact production or Template materialization in Slice.
- Do not import RecipeService, recipe selector evaluators, or recipe Template
  materializers into Slice.
- Do not inspect Review confidence, candidate margin, or diagnostics to decide
  automatic execution.
- Do not store Slice queue/progress in Session.
- Do not call or reintroduce a Template-owned apply workflow from Slice.
