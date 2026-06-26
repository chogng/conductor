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
- `SliceRequest` queue entries from legacy Session raw-table execution and
  `SliceUriRequest` queue entries from URI-backed review execution controllers
  or user commands;
- slice file state, priority, cancellation, and queue draining;
- calling the planner/executor and either committing legacy raw-table
  `SliceCommit` values through Session or retaining URI-backed `SliceUriResult`
  values in Slice service state.
- URI-backed public APIs and state snapshots should be named around
  `resource` / `target` / model references, following upstream resource-model
  services. Private caches may use `ResourceMap` or a private index, but keyed
  lookup details must not become public API names.
- Prefer upstream-shaped names for URI-backed Slice state: public methods such
  as `getUriResult(target)` / `getUriState(target)`, private caches such as
  `resultsByResource` / `statesByResource` or `mapResourceToSliceResults`, and
  nested sheet buckets such as `resultsBySheetId`. Do not export
  `SliceUriResourceKey`, `createSliceUriResourceKey`, or public
  `uriResultsByResourceKey` / `uriStatesByResourceKey` fields.

`SlicePlanner` owns deterministic plan creation from immutable inputs:
`Template`, raw table dimensions, source versions, and Template-provided
measurement bindings. It must not read rows, start workers, or mutate Session.

`SliceExecutor` owns execution of a `SlicePlan` against supplied rows and
returns a `SliceCommit`. It must not call services or reread Session.

## Core Files

| File | Responsibility |
| --- | --- |
| `common/slice.ts` | service contract, `SliceRequest`, `SliceUriRequest`, `SliceRun`, `SlicePlan`, commit/state/input types. |
| `common/templateSelection.ts` | per-file `TemplateSelection` records, the automatic-selection sentinel, and normalization helpers owned by Slice state. |
| `common/slicePlanner.ts` | pure plan/range generation and migration source/table-model signature helpers. |
| `common/sliceExecutor.ts` | pure row execution into `SliceCommit`. |
| `browser/sliceService.ts` | injectable owner for queue, selection, progress state, row reading, Session commit, and URI result cache. |
| `browser/slicePriority.contribution.ts` | lifecycle subscriber from Explorer selection/hover facts to `ISliceService.prioritize(...)`. |
| `contrib/slice/browser/sliceCommands.ts` / `sliceActions.ts` | command/action entry for user-triggered slicing; normalizes targets and delegates to `ISliceService`. |

## Flow

Session raw-table flow:

```txt
Session RawTableRef + ReviewDecision.ready / manual review result
  -> explicit execution controller validates model/source versions and review signature
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

URI-backed flow:

```txt
Explorer URI target + ReviewDecision.ready / manual review result
  -> explicit execution controller validates model/source versions and review signature
  -> ISliceService.submitUri(SliceUriRequest[])
  -> SliceService reads reviewed Template snapshot from request
  -> SlicePlanner.createSlicePlan(...)
  -> SliceService verifies source/model versions and review/request/template fingerprints
  -> ITableModelService model reference reads current rows
  -> SliceService verifies the same plan signatures again
  -> SliceExecutor.executeSlicePlan(...)
  -> SliceService retains URI-target state and result
  -> PlotService creates calculated data for the URI result
  -> WorkbenchDomainBridge projects chart/explorer state
```

Manual selection flow:

```txt
files.item.setTemplate command
  -> ISliceService.setTemplateSelection(fileId, selection)
  -> SliceState.templateSelectionsByFileId

command/action/controller
  -> ReviewService.reviewManualTemplate(...) or ReviewService.reviewUriManualTemplate(...)
  -> ready ManualTemplateReviewResult
  -> ISliceService.submit(...) or ISliceService.submitUri(...)
  -> SliceService reads reviewed inline/saved Template snapshot
  -> same planner/executor path
  -> Session commit for legacy raw tables, Slice URI result state for URI targets
```

Bulk command flow:

```txt
slice.runWithTemplate / slice.runWithTemplateIncremental command
  -> collect RawTableRef targets from SessionSnapshot and URI targets from Explorer state
  -> review selected Template through Review
  -> ISliceService.submit(...) for legacy targets
  -> ISliceService.submitUri(...) for URI targets
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

TableModel resource changed
  -> SliceService removes matching URI queue entries and URI results
```

Explorer chart state:

```txt
SliceState.fileStates + latest SliceRun + SliceService URI-target state/results
  -> WorkbenchDomainBridge / ExplorerPaneInput
  -> chartState + chartMessage

ReviewService TableReviewSummary
  -> ExplorerDecorationsProvider / ExplorerViewPane
  -> Explorer decoration + review hover
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
- `commitSliceRuns(...)` is the legacy Session boundary. URI-backed slice
  results stay in Slice service URI-target state and must not be bridged into
  Session.
- Slice queue entries must be dropped as stale if their source raw table
  version, review signature, request signature, or reviewed-template
  fingerprint changes before commit.
- Slice table-model signatures include URI-backed source identity and
  `sourceVersion` / `modelVersion` when present, so queued plans and latest-run
  guards can detect editor-model changes in addition to raw table version
  changes.
- If an implementation needs a string lookup value, keep it private and name it
  as an implementation detail such as `cacheKey` or `modelId`; do not name it
  `resourceKey` or expose it from `common/slice.ts`.
- Contributions only subscribe and delegate. They do not plan, execute, read
  rows, or commit Session.
- Slice commands may collect stable `RawTableRef` command targets from
  `SessionSnapshot` and URI targets from Explorer state, but must not read rows,
  plan, execute, or commit Session.

## Do Not

- Do not interpret raw rows/header semantics here; Recipe projection and
  Template materialization happen before Review/Slice.
- Do not re-run table-model production or Template materialization in Slice.
- Do not import RecipeService, recipe selector evaluators, or recipe Template
  materializers into Slice.
- Do not inspect Review confidence, candidate margin, or diagnostics to decide
  automatic execution.
- Do not store Slice queue/progress in Session.
- Do not store URI-backed slice results in Session as a compatibility bridge.
- Do not call or reintroduce a Template-owned apply workflow from Slice.
