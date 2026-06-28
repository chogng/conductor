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
- `SliceUriRequest` queue entries from URI-backed review execution controllers
  or user commands;
- URI slice target state, priority, cancellation, and queue draining;
- calling the planner/executor and retaining URI-backed `SliceUriResult`
  values in Slice service state.
- URI-backed public APIs and state snapshots should be named around
  `resource` / `target` / model references, following upstream resource-model
  services. Private caches may use `ResourceMap` or a private index, but keyed
  lookup details must not become public API names.
- Prefer upstream-shaped names for URI-backed Slice state: public methods such
  as `getUriResult(target)` / `getUriState(target)` and target-scoped events
  such as `onDidChangeUriSliceResult`, target actions such as
  `prioritizeUri(target)`, private caches such as `resultsByResource` /
  `statesByResource` or `mapResourceToSliceResults`, and nested sheet buckets
  such as `resultsBySheetId`. Do not export `SliceUriResourceKey`,
  `createSliceUriResourceKey`, public `uriResultsByResourceKey` /
  `uriStatesByResourceKey` fields, or full URI result lists as `SliceState`
  contract.

`SlicePlanner` owns deterministic plan creation from immutable inputs:
`Template`, URI target, execution dimensions, content/source versions, and
Template-provided measurement bindings. It must not read rows, start
workers, or mutate Session.

`SliceExecutor` owns execution of a `SlicePlan` against supplied rows and
returns target-neutral execution records. `SliceService` wraps those records as
`SliceUriResult` values for URI-backed requests. The executor must not call
services or reread Session. Slice common/executor record types are owned by
Slice; do not import Session model record types just to describe Slice outputs.

## Core Files

| File | Responsibility |
| --- | --- |
| `common/slice.ts` | service contract, `SliceUriRequest`, `SliceRun`, `SlicePlan`, commit/state/input types. |
| `common/templateSelection.ts` | per-file `TemplateSelection` records, the automatic-selection sentinel, and normalization helpers owned by Slice state. |
| `common/slicePlanner.ts` | pure target-aware plan/range generation and migration source / URI content signature helpers. |
| `common/sliceExecutor.ts` | pure row execution into target-neutral Slice execution records. |
| `browser/sliceService.ts` | injectable owner for queue, selection, progress state, data-resource URI content consumption, and URI result cache. |
| `browser/slicePriority.contribution.ts` | lifecycle subscriber from Explorer selection/hover facts to `ISliceService.prioritizeUri(...)` for URI targets. |
| `contrib/slice/browser/sliceCommands.ts` / `sliceActions.ts` | command/action entry for user-triggered slicing; normalizes targets and delegates to `ISliceService`. |

## Flow

URI-backed flow:

```txt
Explorer URI target + ReviewDecision.ready / manual review result
  -> explicit execution controller validates contentHash/sourceVersion, evidence fingerprint, review signature, and template fingerprint
  -> ISliceService.submitUri(SliceUriRequest[])
  -> SliceService reads reviewed Template snapshot from request
  -> SlicePlanner reads measurement binding from reviewed Template snapshot
  -> SlicePlanner.createSlicePlan(...)
  -> SliceService verifies content/source version, evidence/review/request/template fingerprints, and optional materialization version
  -> IDataResourceService resolves structured content and execution rows/ranges for the URI target
  -> SliceService verifies the same plan signatures again
  -> SliceExecutor.executeSlicePlan(...)
  -> SliceService wraps execution records as SliceUriResult
  -> SliceService retains URI-target state and result
  -> PlotService creates calculated data for the URI result
  -> WorkbenchDomainBridge projects chart/explorer state
```

Manual selection flow:

```txt
files.item.setTemplate command
  -> ISliceService.setTemplateSelection(fileId, selection)
  -> SliceState.templateSelectionsByFileId

URI-backed command/action/controller
  -> ReviewService.reviewUriManualTemplate(...)
  -> ready ManualTemplateReviewResult
  -> ReviewService.confirmReviewedTemplate(...) for explicit user-confirmed saved templates
  -> ISliceService.submitUri(...)
  -> SliceService reads reviewed Template snapshot
  -> same planner/executor path
  -> Slice URI result state for URI targets

Session migration-ledger raw-table command/action/controller
  -> no Slice execution path; use URI-backed command/action/controller
```

Bulk command flow:

```txt
slice.runWithTemplate / slice.runWithTemplateIncremental command
  -> collect URI targets from Explorer state
  -> ReviewService.reviewUriForExecution({ resource, sheetId }) for each target
  -> URI targets use Review's execution projection and manual Template review
  -> ISliceService.submitUri(...) for URI targets
```

Priority flow:

```txt
Explorer selection / hover event
  -> SlicePriorityContribution
  -> Explorer resource entry resolves to URI target
  -> ISliceService.prioritizeUri(target)

Explorer selection / hover without URI resource
  -> no Slice priority action
```

Cleanup flow:

```txt
URI data-resource content/evidence/materialization changed
  -> SliceService removes matching URI queue entries and URI results

User cancel target/all
  -> ISliceService.cancelUri(...) / cancel(...)
  -> SliceService removes matching local queue/state entries
```

Explorer chart state:

```txt
SliceState.fileStates + latest SliceRun + SliceService URI-target state/results
  -> WorkbenchDomainBridge / ExplorerPaneInput
  -> chartState + chartMessage

ReviewService ReviewSummary
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
- `Template` coordinates are physical table relative. Runtime provenance
  belongs to `SlicePlan.inputRanges`, then to URI-backed
  `SliceUriRun.inputRanges`. URI plans must carry URI range provenance
  directly, not synthetic raw-table refs.
- URI-backed slice results stay in Slice service URI-target state and must not
  be bridged into Session.
- URI-backed Slice queue entries must be dropped as stale if the URI content
  target, `contentHash` / `sourceVersion`, `evidenceFingerprint`, optional
  `materializationVersion`, review signature, request signature, or
  reviewed-template fingerprint changes before commit.
- URI-backed Slice signatures include source identity, content version,
  evidence fingerprint, optional materialization version, review signature, and
  template fingerprint, so queued plans and latest-run guards can detect stale
  reviewed execution inputs.
- If an implementation needs a string lookup value, keep it private and name it
  as an implementation detail such as `cacheKey` or `modelId`; do not name it
  `resourceKey` or expose it from `common/slice.ts`.
- Contributions only subscribe and delegate. They do not plan, execute, read
  rows, or commit Session.
- Slice commands collect URI targets from Explorer state, but must not read
  rows, plan, execute, or commit Session.

## Do Not

- Do not interpret raw rows/header semantics here; Recipe interpretation into
  `ReviewCandidate` happens in Review before Slice.
- Do not rebuild structured evidence or Review candidate derivation in Slice.
- Do not import RecipeService, recipe matching helpers, or Review candidate
  builders into Slice.
- Do not inspect Review confidence, candidate margin, or diagnostics to decide
  automatic execution.
- Do not store Slice queue/progress in Session.
- Do not store URI-backed slice results in Session as a compatibility bridge.
- Do not call or reintroduce a Template-owned apply workflow from Slice.
