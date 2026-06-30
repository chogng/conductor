---
description: Slice service - executes canonical Template snapshots into SliceRun, series, and base curves.
applyTo: 'src/cs/workbench/services/slice/**,src/cs/workbench/contrib/slice/**'
---
# Slice

Slice is the execution owner for concrete reviewed or manual `Template`
snapshots. It does not classify raw data, interpret DataResource evidence,
review template quality, or decide whether the system should apply a template.

## Ownership

`ISliceService` owns:

- per-target `TemplateSelection` state as the current template slot for a `{ resource, sheetId? }` target;
- `SliceResourceRequest` queue entries from resource review execution controllers
  or user commands;
- resource/sheet target state, priority, cancellation, and queue draining;
- calling the planner/executor and retaining resource/sheet `SliceResourceResult`
  values in Slice service state.
- Resource-target public APIs and state snapshots should be named around
  `resource` / `target` / model references, following upstream resource-model
  services. Private caches may use `ResourceMap` or a private index, but keyed
  lookup details must not become public API names.
- Prefer upstream-shaped names for resource/sheet Slice state: public methods such
  as `getResourceResult(target)` / `getResourceState(target)` and target-scoped events
  such as `onDidChangeResourceSliceResult`, target actions such as
  `prioritizeResource(target)`, private caches such as `resultsByResource` /
  `statesByResource` or `mapResourceToSliceResults`, and nested sheet buckets
  such as `resultsBySheetId`. Do not export `SliceResourceKey`,
  `createSliceResourceKey`, public `resourceResultsByKey` /
  `resourceStatesByKey` fields, or full resource result lists as `SliceState`
  contract.

`SlicePlanner` owns deterministic plan creation from immutable inputs:
`Template`, `{ resource, sheetId? }` target, execution dimensions, content/source versions, and
Template-provided measurement bindings. It must not read rows, start
workers, or mutate Session.

`SliceExecutor` owns execution of a `SlicePlan` against supplied rows and
returns target-neutral execution records. `SliceService` wraps those records as
`SliceResourceResult` values for resource/sheet requests. The executor must not call
services or reread Session. Slice common/executor record types are owned by
Slice; do not import Session model record types just to describe Slice outputs.

## Core Files

| File | Responsibility |
| --- | --- |
| `common/slice.ts` | service contract, `SliceResourceRequest`, `SliceRun`, `SlicePlan`, commit/state/input types. |
| `common/templateSelection.ts` | per-target `TemplateSelection` records, the automatic-selection sentinel, current-template-slot ids, equality, and normalization helpers owned by Slice state. |
| `common/slicePlanner.ts` | pure target-aware plan/range generation and migration source / URI content signature helpers. |
| `common/sliceExecutor.ts` | pure row execution into target-neutral Slice execution records. |
| `browser/sliceService.ts` | injectable owner for queue, selection, progress state, data-resource URI content consumption, and resource result cache. |
| `browser/slicePriority.contribution.ts` | lifecycle subscriber from Explorer selection/hover facts to `ISliceService.prioritizeResource(...)` for resource/sheet targets. |
| `contrib/slice/browser/sliceCommands.ts` / `sliceActions.ts` | command/action entry for user-triggered slicing; normalizes targets and delegates to `ISliceService`. |

## Flow

Resource/sheet flow:

```txt
Explorer `{ resource, sheetId? }` target + ReviewDecision.ready / manual review result
  -> explicit execution controller validates contentHash/sourceVersion, evidence fingerprint, review signature, and template fingerprint
  -> ISliceService.submitResource(SliceResourceRequest[])
  -> SliceService reads reviewed Template snapshot from request
  -> SlicePlanner reads measurement binding from reviewed Template snapshot
  -> SlicePlanner.createSlicePlan(...)
  -> SliceService verifies content/source version, evidence/review/request/template fingerprints, and optional materialization version
  -> IDataResourceService resolves structured content and execution rows/ranges for the target
  -> SliceService verifies the same plan signatures again
  -> SliceExecutor.executeSlicePlan(...)
  -> SliceService wraps execution records as SliceResourceResult
  -> SliceService retains resource/sheet target state and result
  -> PlotService creates calculated data for the Slice result
  -> WorkbenchDomainBridge projects chart/explorer state
```

Manual selection flow:

```txt
files.item.setTemplate command
  -> ISliceService.setTemplateSelection({ resource, sheetId }, selection)
  -> SliceState.templateSelections / current template slot

Table template visualization:
  -> TableTemplateDecorationsProvider reads ISliceService.getTemplateSelection({ resource, sheetId })
  -> auto slot materializes through Review's current system recommended ReviewedTemplate.template
  -> saved slot materializes through IUserTemplateService.getTemplate(...).template
  -> table decoration provider projects the materialized Template for display only

Resource/sheet command/action/controller
  -> read the same per-target TemplateSelection slot
  -> ReviewService.reviewResourceManualTemplate(...)
  -> ready ManualTemplateReviewResult
  -> ReviewService.confirmReviewedTemplate(...) for explicit user-confirmed saved templates
  -> ISliceService.submitResource(...)
  -> SliceService reads reviewed Template snapshot
  -> same planner/executor path
  -> Slice result state for resource/sheet targets

Session migration-ledger raw-table command/action/controller
  -> no Slice execution path; use resource/sheet command/action/controller
```

Bulk command flow:

```txt
slice.runWithTemplate / slice.runWithTemplateIncremental command
  -> collect `{ resource, sheetId? }` targets from Explorer state
  -> ReviewService.reviewResourceForExecution({ resource, sheetId }) for each target
  -> targets use Review's execution projection and manual Template review
  -> ISliceService.submitResource(...) for resource/sheet targets
```

Priority flow:

```txt
Explorer selection / hover event
  -> SlicePriorityContribution
  -> Explorer resource entry resolves to `{ resource, sheetId? }` target
  -> ISliceService.prioritizeResource(target)

Explorer selection / hover without resource target
  -> no Slice priority action
```

Cleanup flow:

```txt
Data-resource content/evidence/materialization changed
  -> SliceService removes matching target queue entries and results

User cancel target/all
  -> ISliceService.cancelResource(...)
  -> SliceService removes matching local queue/state entries
```

Explorer chart state:

```txt
SliceService resource/sheet target state/results
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
  belongs to `SlicePlan.inputRanges`, then to resource/sheet
  `SliceResourceRun.inputRanges`. Plans must carry resource/sheet range provenance
  directly, not synthetic raw-table refs.
- Resource/sheet slice results stay in Slice service resource/sheet target state and must not
  be bridged into Session.
- Resource/sheet Slice queue entries must be dropped as stale if the URI content
  target, `contentHash` / `sourceVersion`, `evidenceFingerprint`, optional
  `materializationVersion`, review signature, request signature, or
  reviewed-template fingerprint changes before commit.
- Resource/sheet Slice signatures include source identity, content version,
  evidence fingerprint, optional materialization version, review signature, and
  template fingerprint, so queued plans and latest-run guards can detect stale
  reviewed execution inputs.
- If an implementation needs a string lookup value, keep it private and name it
  as an implementation detail such as `cacheKey` or `modelId`; do not name it
  `resourceKey` or expose it from `common/slice.ts`.
- Contributions only subscribe and delegate. They do not plan, execute, read
  rows, or commit Session.
- Slice commands collect `{ resource, sheetId? }` targets from Explorer state, but must not read
  rows, plan, execute, or commit Session.

## Do Not

- Do not interpret raw rows/header semantics here; DataResource evidence
  production and ReviewCandidate projection happen before Slice.
- Do not rebuild structured evidence or Review candidate derivation in Slice.
- Do not import DataResource semantic matchers or Review candidate builders
  into Slice.
- Do not inspect Review confidence, candidate margin, or diagnostics to decide
  automatic execution.
- Do not store Slice queue/progress in Session.
- Do not store resource/sheet slice results in Session as a compatibility bridge.
- Do not call or reintroduce a Template-owned apply workflow from Slice.
