---
description: Template domain - canonical Template specs, editor view-model conversion, and Template UI state.
applyTo: 'src/cs/workbench/services/template/**,src/cs/workbench/contrib/template/**'
---
# Template

`Template` is the concrete extraction/slicing spec executed by Slice after
Review has accepted automatic or manual input. In target architecture:

```txt
URI/content structured evidence + Recipe/UserTemplate/built-in template snapshot
  -> ReviewCandidate
  -> ReviewResult / ReviewedTemplate
  -> Slice
```

Automatic Review consumes structured content evidence for a URI-backed content
version. Built-in recipes, built-in template snapshots, and user templates are
candidate sources, but they do not bypass Review. Slice executes the reviewed
`Template`; Review judges usability; Template owns the executable spec and
editor adapters.

Do not add consumer-shaped template sections such as `template.review`,
`template.slicing`, or `template.binding`. Review consumes URI/content
structured evidence to build candidates; Template must keep content evidence
distinct from the executable `Template` snapshot.

Template editor form records are not the domain `Template`; name them
`TemplateEditorRecord` / `TemplateEditorConfig`.

## Ownership

Template owns the core `Template` spec and editor-record conversion. It does
not own Recipe/UserTemplate automatic candidate derivation, UserTemplate catalog
CRUD, catalog snapshots, Review decisions, per-file template selections, or
raw-file view input.

`ITemplateViewStateService` in Template contrib owns selected-template/form
editor state for Template UI and related view projections. Slicing selections
belong to `ISliceService`, and Template UI reads Session projections in contrib
code.

`IUserTemplateService` owns persisted user-template catalog records. Template
UI may adapt records into `TemplateEditorConfig` while editing, but must write
native records back through `IUserTemplateService`.

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
| `common/templateSpec.ts` | pure block-aware `Template` spec: measurement binding, row ranges, axis bindings, segmentation, legends, titles, applicability, and execution defaults. |
| `common/template.ts` | `TemplateEditorRecord` and re-exported template spec types. |
| `common/templateEditorAdapter.ts` | adapter between Template editor records and canonical block-aware `Template`. |
| `common/templateEditorConfig.ts` | Template editor config normalization, cloning, and save/apply validation. |
| `common/templateCellRange.ts` | A1-style cell and X range helpers used by Template editor records and validation. |
| `common/templateXYBinding.ts` | Pure XY column-count checks for Template editor/save validation. |
| `common/templateFingerprint.ts` | Stable Template fingerprint generation for candidate interpretations and reviewed snapshots. |
| `contrib/template/common/template.ts` | Template workbench view id and command ids shared by contribution, commands, and view code. |
| `contrib/template/browser/templateCommands.ts` | Template command registration and handlers; delegates library management to `IUserTemplateService` and execution wrappers to Slice. |
| `contrib/template/browser/templateImportExport.ts` | Template UI JSON import/export file-transfer helper; dialog, file read, save-file write, and browser download fallback plumbing only. Payload semantics stay with Template commands and `IUserTemplateService`. |
| `contrib/template/browser/templateTableMap.ts` | Bidirectional UI-only mapper between `ITableService` selection/cell/range state and Template editor `TemplateEditorConfig` fields. |
| `contrib/template/browser/templateUserTemplateAdapter.ts` | View-model adapter from UserTemplate snapshots into editable Template editor records. |
| `contrib/template/browser/templateViewStateService.ts` | Template UI selected-template/form editor state. |
| `contrib/template/browser/templateViewlet.ts` | Workbench `ViewPane` entry; owns Template pane DI, lifecycle, service subscriptions, and title updates. |
| `contrib/template/browser/views/templateView.ts` | Template pane coordinator; switches management/editor mode, builds child view state, handles child callbacks, and syncs table selection. |
| `contrib/template/browser/views/templateManagementView.ts` | Template management leaf view; renders picker, management controls, and Slice apply buttons. |
| `contrib/template/browser/views/templateEditorView.ts` | Template editor leaf view; renders the editable `TemplateEditorConfig` form and reports user edits upward. |

## Flow

Automatic Review candidate derivation:

```txt
review request / recipeChanged / userTemplateChanged
  -> ReviewService reads content evidence and Recipe/UserTemplate/built-in template snapshots
  -> ReviewService derives ReviewCandidate values
  -> ReviewService scores candidates
```

Automatic candidate derivation belongs under `services/review/common`. Do not
add automatic Recipe/UserTemplate/built-in template candidate builders under
Template, Table, or Slice.

Manual execution:

```txt
manual saved-selection compatibility/UserTemplate/inline run
  -> ReviewService.reviewUri({ resource, sheetId })
  -> ReviewService.reviewUriManualTemplate(...)
  -> ManualTemplateReviewResult.ready
  -> ISliceService.submitUri(SliceUriRequest(trigger = userCommand))
  -> Slice executes the reviewed Template snapshot
```

Template execution enters through Slice. Saved/manual editor records are adapted
into canonical `Template` snapshots before Slice runs.

JSON import/export:

```txt
import/export command
  -> templateImportExport reads JSON or exports the native payload through save-file/write or browser download
  -> templateCommands validates the native UserTemplate catalog payload
  -> IUserTemplateService imports/exports native UserTemplate catalog payloads
```

## Rules

- `Template` is a concrete extraction/slicing spec. Review produces reviewed
  snapshots from automatic candidates or manual input; Slice consumes reviewed
  or manual snapshots and must not derive Recipe/UserTemplate/built-in template
  candidates.
- Engines should consume `Template`, not consumer-specific sub-templates.
- Template editor records may be bridged through `TemplateEditorConfig` and
  `templateEditorAdapter`; they are inputs to `Template` snapshots, not an
  execution workflow.
- Raw-header auto-template inference is retired from product execution.
  New `URI/content structured evidence + Recipe/UserTemplate/built-in template
  snapshot -> ReviewCandidate` derivation belongs in Review candidate helpers,
  not Template execution.
- Automatic template selection ids belong to Slice `templateSelection`, not
  Template common. Template common must not own selection sentinels.
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
- Template UI library management must read/write `IUserTemplateService`;
  `TemplateEditorConfig` is only an editor view model and must not be used as
  the JSON import/export payload format.
- Browser export fallback may download the native `conductor.userTemplate`
  JSON payload when the platform cannot expose a save-file target. It must not
  resurrect the retired Template-editor bundle payload.
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
- Review, not Template or Slice, decides whether missing, curve-only,
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
  -> ReviewService.reviewUri({ resource, sheetId })
  -> ReviewService.reviewUriManualTemplate
  -> ready ManualTemplateReviewResult
  -> ISliceService.submitUri(SliceUriRequest)
  -> SlicePlan + SliceUriResult
```

Commands/controllers must not re-detect table structure.

## Field Catalog

Use `records.instructions.md` for `TemplateEditorRecord`,
`TemplateEditorConfig`, `Template`, `TemplateState`, and `SliceRun`.

## Do Not

- Do not infer IV/CV/transfer/output inside the executable `Template` spec or
  Slice path. Such inference belongs to structured content evidence production
  and Review-owned candidate helpers before Slice.
- Do not split `Template` by review/slice/binding/apply consumers.
- Do not store template form draft state in Session.
- Do not let worker payload format leak into Session records.
- Do not let TemplateView mutate Session directly.
- Do not route processing cleanup through Explorer submit events or Workbench-only callbacks.
- Do not park Settings filename matching helpers or preview-only auto-segmentation
  probes under `services/template/common`.
