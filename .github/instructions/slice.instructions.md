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

- per-resource `TemplateSelection` state as the current template slot for a
  `{ resource, sheetId? }` identity;
- workspace-scoped persistence of saved per-resource template overrides through
  `IStorageService`; automatic selection remains the implicit default and is not
  persisted as a duplicate record;
- `SliceResourceRequest` queue entries from resource review execution controllers
  or user commands;
- resource/sheet state, priority, cancellation, and queue draining;
- calling the planner/executor and retaining resource/sheet `SliceResourceResult`
  values in Slice service state.
- Public Slice APIs expose `resource: URI` as the identity core and optional
  `sheetId` beside it: `getResourceResult(resource, sheetId?)`,
  `getResourceState(resource, sheetId?)`, `prioritizeResource(resource, sheetId?)`,
  `setTemplateSelection(resource, sheetId, selection)`, and resource/sheet
  events such as `onDidChangeResourceSliceResult`.
- Do not export public resource-target wrapper types, public resource keys,
  public keyed maps, or nested `{ target: { resource, sheetId } }` wrappers from
  Slice contracts. Private caches may use `ResourceMap`, private cache keys, or
  nested sheet buckets, but keyed lookup details must not become public API
  names.

`SlicePlanner` owns deterministic plan creation from immutable inputs:
`Template`, `resource`, optional `sheetId`, execution dimensions, content/source versions, and
Template-provided measurement bindings. It must not read rows, start
workers, or mutate another owner.

`SliceExecutor` owns execution of a `SlicePlan` against supplied rows and
returns resource-neutral execution records. `SliceService` wraps those records as
`SliceResourceResult` values for resource/sheet requests. The executor must not call
services. Slice common/executor record types are owned by Slice; do not import
another domain's record types just to describe Slice outputs.

## Core Files

| File | Responsibility |
| --- | --- |
| `common/slice.ts` | service contract, `SliceResourceRequest`, `SliceRun`, `SlicePlan`, commit/state/input types. |
| `common/templateSelection.ts` | per-resource `TemplateSelection` records, the automatic-selection sentinel, current-template-slot ids, equality, and normalization helpers owned by Slice state. |
| `common/slicePlanner.ts` | pure resource-aware plan/range generation and migration source / URI content signature helpers. |
| `common/sliceExecutor.ts` | pure row execution into resource-neutral Slice execution records. |
| `browser/sliceService.ts` | injectable owner for queue, selection, progress state, data-resource URI content consumption, and resource result cache. |
| `browser/slicePriority.contribution.ts` | lifecycle subscriber from Explorer selection/hover facts to `ISliceService.prioritizeResource(...)` for resource/sheet targets. |
| `contrib/slice/browser/sliceCommands.ts` / `sliceActions.ts` | command/action entry for user-triggered slicing; normalizes targets and delegates to `ISliceService`. |

## Flow

Resource/sheet flow:

```txt
Explorer `{ resource, sheetId? }` identity + ReviewDecision.ready / manual review result
  -> explicit execution controller validates contentHash/sourceVersion, evidence fingerprint, review signature, and template fingerprint
  -> ISliceService.submitResource(SliceResourceRequest[])
  -> SliceService reads reviewed Template snapshot from request
  -> SlicePlanner reads measurement binding from reviewed Template snapshot
  -> SlicePlanner.createSlicePlan(...)
  -> SliceService verifies content/source version, evidence/review/request/template fingerprints, and optional materialization version
  -> IDataResourceService resolves structured content and execution rows/ranges for the resource/sheet
  -> SliceService verifies the same plan signatures again
  -> SliceExecutor.executeSlicePlan(...)
  -> SliceService wraps execution records as SliceResourceResult
  -> SliceService retains resource/sheet state and result
  -> PlotService creates calculated data for the Slice result
  -> WorkbenchDomainBridge projects chart/explorer state
```

Manual selection flow:

```txt
files.item.setTemplate command
  -> ISliceService.setTemplateSelection(resource, sheetId, selection)
  -> SliceState.templateSelections / current template slot

Table template visualization:
  -> TableTemplateDecorationsProvider reads ISliceService.getTemplateSelection(resource, sheetId)
  -> auto slot materializes through Review's current system recommended ReviewedTemplate.template
  -> saved slot materializes through IUserTemplateService.getTemplate(...).template
  -> table decoration provider projects the materialized Template for display only

Resource/sheet command/action/controller
  -> read the same per-resource TemplateSelection slot
  -> ReviewService.reviewResourceManualTemplate(...)
  -> ready ManualTemplateReviewResult
  -> ReviewService.confirmReviewedTemplate(...) for explicit user-confirmed saved templates
  -> ISliceService.submitResource(...)
  -> SliceService reads reviewed Template snapshot
  -> same planner/executor path
  -> Slice result state for resource/sheet identities

```

Bulk command flow:

```txt
slice.runWithTemplate / slice.runWithTemplateIncremental command
  -> collect `{ resource, sheetId? }` identities from Explorer state
  -> explicit saved Template selection in the Template view overrides the batch
  -> otherwise read each resource/sheet TemplateSelection slot
  -> ReviewService.reviewResourceForExecution({ resource, sheetId }) for each resource/sheet
  -> resources use Review's execution projection and manual Template review
  -> ISliceService.submitResource(...) for resource/sheet identities
```

Priority flow:

```txt
Explorer selection / hover event
  -> SlicePriorityContribution
  -> Explorer resource entry resolves to `resource` and optional `sheetId`
  -> ISliceService.prioritizeResource(resource, sheetId)

Explorer selection / hover without resource identity
  -> no Slice priority action
```

Cleanup flow:

```txt
Data-resource content/evidence/materialization changed
  -> SliceService removes matching resource/sheet queue entries and results
  -> saved TemplateSelection remains attached to the resource/sheet
  -> the next execution revalidates that selection against current data through Review

Workspace folder changed
  -> flush workspace storage
  -> clear Slice queue/result/progress state
  -> restore saved TemplateSelection records from the new workspace storage

User cancel resource/all
  -> ISliceService.cancelResource([{ resource, sheetId? }, ...])
  -> SliceService removes matching local queue/state entries
```

Explorer chart state:

```txt
SliceService resource/sheet state/results
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
- Resource/sheet slice results stay in Slice service resource/sheet state.
- Resource/sheet Slice queue entries must be dropped as stale if the URI content
  resource/sheet identity, `contentHash` / `sourceVersion`, `evidenceFingerprint`, optional
  `materializationVersion`, review signature, request signature, or
  reviewed-template fingerprint changes before commit.
- Resource/sheet Slice signatures include source identity, content version,
  evidence fingerprint, optional materialization version, review signature, and
  template fingerprint, so queued plans and latest-run guards can detect stale
  reviewed execution inputs.
- If an implementation needs a string lookup value, keep it private and name it
  as an implementation detail such as `cacheKey` or `modelId`; do not name it
  `resourceKey` or expose it from `common/slice.ts`.
- Contributions only subscribe and delegate. They do not plan, execute, or read
  rows.
- Slice commands collect `{ resource, sheetId? }` identities from Explorer state,
  but must not read rows, plan, or execute.

## Do Not

- Do not interpret raw rows/header semantics here; DataResource evidence
  production and ReviewCandidate projection happen before Slice.
- Do not rebuild structured evidence or Review candidate derivation in Slice.
- Do not import DataResource semantic matchers or Review candidate builders
  into Slice.
- Do not inspect Review confidence, candidate margin, or diagnostics to decide
  automatic execution.
- Do not store Slice queue/progress outside Slice.
- Do not store resource/sheet Slice results in a compatibility ledger.
- Do not call or reintroduce a Template-owned apply workflow from Slice.
