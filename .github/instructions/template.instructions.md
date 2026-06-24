---
description: Template domain - canonical Template specs, table+recipe materialization, editor view-model conversion, and Template UI state.
applyTo: 'src/cs/workbench/services/template/**,src/cs/workbench/contrib/template/**'
---
# Template

`Template` is the concrete extraction/slicing spec produced by applying table
facts to Recipe or UserTemplate rules. In target architecture:

```txt
TableFacts + Recipe/UserTemplate -> Template candidates -> Review -> Slice
```

The "Table" in this formula means canonical raw-table facts and derived
structure/column/block facts, not the UI `ITableService` selection model.
Slice executes the reviewed `Template`; Review judges usability; Template owns
materialization.

Do not add consumer-shaped template sections such as `template.review`,
`template.slicing`, or `template.binding`. Template may own table-fact
projection and materialization, but it must keep raw table facts distinct from
the executable `Template` snapshot.

Legacy/manual extraction presets are not the domain `Template`; name them
`TemplateApplyPresetRecord` / `TemplateApplyConfig`.

## Ownership

Template owns the core `Template` spec, table+recipe materialization helpers,
and legacy apply-preset view-model conversion. It does not own UserTemplate
catalog CRUD, catalog snapshots, Review decisions, per-file template
selections, or raw-file view input.

`ITemplateViewStateService` in Template contrib owns selected-template/form
editor state for Template UI and related view projections. Slicing selections
belong to `ISliceService`, and Template UI reads Session projections in contrib
code.

`IUserTemplateService` owns persisted user-template catalog records. Template
UI may adapt records into `TemplateApplyConfig` while editing, but must
materialize writes back through `IUserTemplateService`.

Old Template-owned apply controllers, planners, processing workers, and
run/output Session commits have been removed. New execution behavior belongs in
Slice; do not add primary planning, queue, worker, commit, or workflow-input
responsibility under Template. Progress and readiness surfaces come from
`ISliceService`.

Template specs do not own slicing execution, raw import, table selection state,
plot rendering, or chart state.

## Core Files

| File | Responsibility |
| --- | --- |
| `common/templateSpec.ts` | pure block-aware `Template` spec: row ranges, axis bindings, segmentation, legends, titles, applicability, and execution defaults. |
| `common/builtinTemplateSpecs.ts` | built-in domain template specs. |
| `common/templateDraft.ts` | candidate draft shape produced from `TableFacts + Recipe/UserTemplate` before Review status/policy projection. |
| `common/recipeSelectorEvaluator.ts` | pure Recipe selector evaluator over canonical table facts. |
| `common/recipeTemplateMaterializer.ts` | pure Recipe + table-facts materializer that creates `TemplateDraft` candidates. |
| `common/userTemplateMaterializer.ts` | pure UserTemplate + table-facts materializer that creates `TemplateDraft` candidates. |
| `common/automaticTemplateMaterializer.ts` | combines Recipe and UserTemplate materializers into the automatic candidate set. |
| `common/template.ts` | `TemplateApplyPresetRecord`, command ids, and re-exported template spec types. |
| `common/templateLegacyAdapter.ts` | adapter between historical/manual apply-preset view models and canonical block-aware `Template`. |
| `common/autoTemplateApplyConfig.ts` | legacy serializer from auto-extraction plan shape into editable apply/worker config records; do not add detection logic here. |
| `common/templateApplyConfigUtils.ts` | legacy/manual apply config normalization and cloning. |
| `common/templateSelection.ts` | selection records/helpers. |
| `contrib/template/browser/templateFileTransfer.ts` | Template UI JSON import/export workflow helper; parses/serializes legacy bundles. |
| `contrib/template/browser/templateUserTemplateAdapter.ts` | View-model adapter from UserTemplate snapshots into legacy editable apply records. |
| `contrib/template/browser/templateViewStateService.ts` | Template UI selected-template/form editor state. |
| `contrib/template/browser/templateAuxiliaryBarViewPane.ts` / `views/templateView.ts` | UI shell; renders UserTemplate catalog + view state and sends commands. |

## Flow

Automatic materialization:

```txt
rawTableChanged / recipeChanged / userTemplateChanged / schemaProfileChanged
  -> Template contribution/materializer
  -> read canonical raw table facts and Recipe/UserTemplate snapshots
  -> materialize Template candidates
  -> ReviewService reviews materialized candidates
```

Table-fact production belongs under `services/tableFacts`. Candidate derivation
belongs under `services/template/common`; do not add new materializers under
TableFacts, Review, or Slice.

Manual execution:

```txt
manual saved-selection compatibility/UserTemplate/inline run
  -> ReviewService.reviewManualTemplate(...)
  -> ManualTemplateReviewResult.ready
  -> ISliceService.submit(SliceRequest(trigger = userCommand))
  -> Slice executes the reviewed Template snapshot
```

Template execution enters through Slice. Saved/manual apply presets are adapted
into canonical `Template` snapshots before Slice runs.

## Rules

- `Template` is a concrete extraction/slicing spec. Template materializers
  produce it from table facts plus Recipe/UserTemplate sources; Slice consumes
  reviewed or manual snapshots and must not materialize Recipes.
- Engines should consume `Template`, not consumer-specific sub-templates.
- Legacy/manual apply presets may be bridged through `TemplateApplyConfig` and
  `templateLegacyAdapter`; they are inputs to `Template` snapshots, not an
  execution workflow.
- Legacy raw-header auto-template inference is compatibility-only. New
  `TableFacts + Recipe/UserTemplate -> Template` derivation belongs in Template
  materialization helpers, not Template execution.
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
  store them in `TemplateState` or `IUserTemplateService`.
- Do not reintroduce Template-owned workflow inputs or
  `TemplateState.selectionsByFileId`; slicing selections come from
  `ISliceService`.
- Template UI library management must read/write `IUserTemplateService`; legacy
  `TemplateApplyConfig` is only an editor view model and import/export bundle
  compatibility format.
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
- Review, not Template or Slice, decides whether missing, legacy curve-only,
  unknown, low-confidence, review-required, or ambiguous evidence can be
  applied by the system. Keep skipped/blocked files visible through Explorer
  badges driven by Review and Slice projections.
- Full/incremental apply must not start while another extraction job is running or while Explorer has pending/preparing sources.
- Session cleanup: `filesRemoved` removes affected queued files; `sessionCleared` terminates and resets active processing.

## Commands

Template commands cover template library management. New application/execution
commands delegate to Slice. Historical `template.applyTemplate*` command ids
may remain only as compatibility wrappers that call the Slice command handler;
do not route execution through Template code.

```txt
slice.runWithTemplate command
  -> ReviewService.reviewManualTemplate
  -> ready ManualTemplateReviewResult
  -> ISliceService.submit(SliceRequest)
  -> SlicePlan + SliceCommit
  -> ISessionService.commitSliceRuns
```

Commands/controllers must not re-detect table structure.

## Field Catalog

Use `records.instructions.md` for `TemplateApplyPresetRecord`,
`TemplateApplyConfig`, `Template`, `TemplateState`, and `SliceRun`.

## Do Not

- Do not infer IV/CV/transfer/output inside the executable `Template` spec or
  Slice path. Such inference belongs to table-fact production and
  Template-owned materializer helpers before Review/Slice.
- Do not split `Template` by review/slice/binding/apply consumers.
- Do not store template form draft state in Session.
- Do not let worker payload format leak into Session records.
- Do not let TemplateView mutate Session directly.
- Do not route processing cleanup through Explorer submit events or Workbench-only callbacks.
