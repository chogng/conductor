---
description: Template service - template catalog/preset CRUD, canonical Template specs, and legacy preset conversion.
applyTo: 'src/cs/workbench/services/template/**,src/cs/workbench/contrib/template/**'
---
# Template

`Template` is a concrete extraction/slicing spec for raw tables whose
measurement structure has already been determined. It is materialized by
Assessment or created by users, then executed by Slice.

Do not add consumer-shaped template sections such as `template.assessment`,
`template.slicing`, or `template.binding`. Do not make Template describe how to
detect raw table structure, measurement family, roles, or units; those facts
belong to Assessment evidence and Recipe-backed candidate derivation.

Legacy/manual extraction presets are not the domain `Template`; name them
`TemplateApplyPresetRecord` / `TemplateApplyConfig`.

## Ownership

`ITemplateService` owns saved apply-preset CRUD, the cached preset list, list
events, the template catalog snapshot/version, and canonical
`getTemplate(id)` reads. It does not own selected-template/form editor state,
per-file template selections, or raw-file view input.

`ITemplateViewStateService` in Template contrib owns selected-template/form
editor state for Template UI and related view projections. Slicing selections
belong to `ISliceService`, and Template UI reads Session projections in contrib
code.

`ITemplateStoreService` owns template persistence backend access. Desktop
`template.json` persistence uses platform file service and
`IJSONEditingService`; Electron main only exposes generic file capability.

Old Template-owned apply controllers, planners, processing workers, and
run/output Session commits have been removed. New execution behavior belongs in
Slice; do not add primary planning, queue, worker, commit, or workflow-input
responsibility under Template. Progress and readiness surfaces come from
`ISliceService`.

Template specs do not own assessment, slicing execution, binding, raw import,
table selection state, plot rendering, or chart state.

## Core Files

| File | Responsibility |
| --- | --- |
| `common/templateSpec.ts` | pure block-aware `Template` spec: row ranges, axis bindings, segmentation, legends, titles, applicability, and execution defaults. |
| `common/builtinTemplateSpecs.ts` | built-in domain template specs. |
| `common/template.ts` | template catalog service contract, `TemplateApplyPresetRecord`, CRUD contracts, `getTemplate(id)`, and re-exported template spec types. |
| `common/templateLegacyAdapter.ts` | migration adapter from historical/manual presets into canonical block-aware `Template`. |
| `common/autoTemplateApplyConfig.ts` | legacy serializer from auto-extraction plan shape into editable apply/worker config records; do not add detection logic here. |
| `common/templateApplyConfigUtils.ts` | legacy/manual apply config normalization and cloning. |
| `common/templateStore.ts` | persistence backend contract and data normalization. |
| `common/templateSelection.ts` | selection records/helpers. |
| `browser/templateService.ts` | CRUD, cached preset list, catalog snapshot/version read APIs. |
| `browser/templateStoreService.ts` / `electron-browser/templateStoreService.ts` | browser fallback and desktop persistence. |
| `contrib/template/browser/templateViewStateService.ts` | Template UI selected-template/form editor state. |
| `contrib/template/browser/templateAuxiliaryBarViewPane.ts` / `views/templateView.ts` | UI shell; renders template catalog + view state and sends commands. |

## Flow

```txt
TemplateService template list change
  -> onDidChangeTemplates
  -> AssessmentQueue captures templateCatalogVersion
  -> Assessment may evaluate exact saved-template candidates
  -> selected Template snapshot is stored on RawTableAssessmentRecord
  -> Slice executes the selected Template snapshot
```

Template execution enters through Slice. Saved/manual apply presets are adapted
into canonical `Template` snapshots before Slice runs.

## Rules

- `Template` is a concrete extraction/slicing spec. Assessment chooses or
  materializes it after structure is known; Slice executes it.
- Engines should consume `Template`, not consumer-specific sub-templates.
- Legacy/manual apply presets may be bridged through `TemplateApplyConfig` and
  `templateLegacyAdapter`; they are inputs to `Template` snapshots, not an
  execution workflow.
- Legacy raw-header auto-template inference is compatibility-only and lives
  outside Template; do not add new detection rules to Template execution.
- Do not export or share a special Auto Template ID as domain API. UI-only
  values stay local to their view, and compatibility parsing for old `"0"` /
  `"__auto__"` values must go through `isAutoTemplateId(...)`.
- Template may read current table selection through injected `ITableService` public APIs only as explicit user input.
- Do not pass `ITableService`, table row readers, or table model methods through Template view/workflow input.
- Template execution is an owner API on `ISliceService`; UI must not invoke
  Template-owned controller code as an execution API.
- WorkbenchDomainBridge must not construct or push Template-owned execution
  workflow inputs, and must not read `TemplateState` for Explorer current-template display.
  Explorer current-template display is a view projection in ExplorerViewPane;
  per-file slicing selections come from `ISliceService`.
- Per-file template selections for slicing belong to `ISliceService`; do not
  store them in `TemplateState` or `ITemplateService`.
- Do not reintroduce Template-owned workflow inputs or
  `TemplateState.selectionsByFileId`; slicing selections come from
  `ISliceService`.
- Template list consumers must read `ITemplateService.getTemplateList()` and
  subscribe to `onDidChangeTemplates`; they must not maintain a second
  template list cache in Explorer or Template UI.
- `activeFileId` should move the current chart/Explorer target to the front of full and incremental slice queues.
- Explorer hover/selection priority for slicing belongs to
  `SlicePriorityContribution` -> `ISliceService.prioritize(...)`; do not route
  it through WorkbenchDomainBridge or Template code.
- New slice progress belongs to `ISliceService`; consumers subscribe and reread
  `SliceState`. WorkbenchDomainBridge and Explorer use Slice file states as the
  only progress source.
- Per-file readiness belongs to Slice; Explorer projects it into badges/chart-state without adding/removing file tree items.
- Mark files `processing` when a single-file task starts, then `ready`, `failed`, or remove through the same owner state.
- `SliceRun` records include template fingerprint and source block ids.
- Execution commits through `commitSliceRuns(...)`; do not add Template-owned
  run/output commit or cleanup APIs.
- Skip missing, legacy curve-only, unknown, low-confidence, review-required, or
  `AssessmentDecision.autoApplyAllowed !== true` assessments by default.
  Automatic slicing must also require Assessment blocks with usable X/Y
  bindings and canonical units; keep skipped files visible through Explorer
  badges.
- Full/incremental apply must not start while another extraction job is running or while Explorer has pending/preparing sources.
- Session cleanup: `filesRemoved` removes affected queued files; `sessionCleared` terminates and resets active processing.

## Commands

Template commands cover template library management. New application/execution
commands delegate to Slice. Historical `template.applyTemplate*` command ids
may remain only as compatibility wrappers that call the Slice command handler;
do not route execution through Template code.

```txt
slice.runWithTemplate command
  -> ISliceService
  -> resolve TemplateSelection / Template snapshot
  -> SlicePlan + SliceCommit
  -> ISessionService.commitSliceRuns
```

Commands/controllers must not re-detect table structure.

## Field Catalog

Use `records.instructions.md` for `TemplateApplyPresetRecord`,
`TemplateApplyConfig`, `Template`, `TemplateState`, and `SliceRun`.

## Do Not

- Do not infer IV/CV/transfer/output from raw headers here.
- Do not split `Template` by assessment/slice/binding/apply consumers.
- Do not store template form draft state in Session.
- Do not let worker payload format leak into Session records.
- Do not let TemplateView mutate Session directly.
- Do not route processing cleanup through Explorer submit events or Workbench-only callbacks.
