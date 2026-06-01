# Workspace Contrib Split And 旧视图 Exit Plan

`Page.旧视图`, `chartPreview`, and `template` currently hold several different workbench features and a lot of legacy 旧视图. The goal is not to wrap them in a new large `analysis` owner. The goal is to split them into independent contribs with clear ownership, clear registration entry points, and no new 旧视图.

This document lives under `chartPreview` because that is the largest legacy owner today. Once the split starts, move this plan to a workspace-level location if it becomes broader than the chart/template migration.

## Final Direction

The target workbench features are:

- `data`: data table, import result inspection, extraction run entry points, preview rows/cells.
- `template`: template selection, template editing, template preview, template import/export, template application.
- `preview`: file and curve preview, thumbnail cards, active file/series selection.
- `chart`: main plot rendering, chart state, axis state, units, plot settings, canvas drawing.
- `diagnostics`: SS, gm, Vth, probe, and related diagnostic views/models.
- `parameters`: calculated parameters, result tables, RC analysis, metric summaries.
- `export`: Origin open/export, zip export, export selection and export options.
- `onboarding`: onboarding overlay, onboarding controller, guided feature actions.
- `settings`: global persisted settings and defaults. This already exists and should not absorb analysis-page UI.

Do not introduce a long-lived `analysis` contrib as a parent for these. `analysis` is a page/workspace composition concept, not the owner of every feature.

## Shape

Each feature should follow the same basic contrib shape:

```text
src/cs/workbench/contrib/<feature>/
  common/
    <feature>.ts
  browser/
    <feature>.contribution.ts
    <feature>ViewPane.ts
    <feature>View.ts
    <feature>Controller.ts
    <feature>Model.ts
    media/<feature>View.css
```

Keep this shape proportional. Do not create files that have no real role yet. If a feature only needs a view pane and a view, stop there.

Prefer files over nested subdirectories at first. Add subdirectories only when a contrib has enough files that a real subdomain has appeared.

## Service Boundary

Do not create a service just to make every contrib look complete.

Use a service when the feature owns at least one of these:

- Persistence.
- IPC, desktop bridge, native bridge, worker, or API calls.
- Background jobs or progressive work.
- Cross-contrib capability.
- Cache with an owner, invalidation rule, and release path.
- External side effects such as file import/export, Origin, or template storage.

Do not use a service for:

- Pure computation.
- View model creation.
- Simple selection state.
- One-off DOM rendering logic.
- A single branch that can live clearly in a controller.

Use these roles:

- `View`: DOM, ARIA, events, CSS state.
- `Model`: local feature state and display-ready derived state.
- `Resolver`/pure functions: pure transformation and calculation.
- `Controller`: orchestration for one user action.
- `Service`: side effects and cross-boundary capability.
- `.contribution.ts`: workbench registration only.

Expected service decisions:

- `settings`: has `ISettingsService`; keep persisted settings and global defaults there.
- `template`: owns `ITemplateService` for template load/save/delete/import/export and `ITemplateApplyService` for template application processing.
- `table`: uses the existing workbench `ITableService` for preview rows/cells, selection, highlight, and reveal.
- `export`: likely needs `IExportService` for Origin open/export, zip export, and export bridge orchestration.
- `chart`: service only if it owns a render/cache resource or cross-view chart capability; pure drawing and units should start as model/resolver functions.
- `diagnostics`: service only if diagnostics move to worker/progressive/background computation; pure SS/gm/Vth calculations should start as model/resolver functions.
- `parameters`: service only if RC or parameter computation calls a worker/API/bridge; otherwise keep calculation in model/resolver.
- `preview`: usually no service; selection and file card state should be model/controller.
- `onboarding`: usually no service unless onboarding state becomes persisted or cross-window; use controller/contribution first.

Service interfaces belong in `common` when callers and implementations need a stable boundary:

```text
src/cs/workbench/contrib/<feature>/common/<feature>.ts
  I<Feature>Service
  <Feature>ContributionId
  <Feature>ViewId
  DTOs and protocol types

src/cs/workbench/contrib/<feature>/browser/<feature>Service.ts
  Browser<Feature>Service
  registerSingleton(...)
```

Views must not call desktop bridges, APIs, workers, or persistence directly. They call controllers; controllers call services when side effects are needed.

## Media And CSS Boundary

Feature media belongs to the feature that owns the UI.

Default shape:

```text
src/cs/workbench/contrib/<feature>/browser/media/<feature>View.css
```

Rules:

- Workspace CSS only owns shell, layout, pane containers, and top-level composition.
- Feature CSS owns feature internals: chart, template, parameters, diagnostics, export, preview, onboarding, and settings UI.
- Do not put chart/template/parameters/export internal classes in workspace CSS.
- Do not keep feature CSS in `chartPreview` after the owning UI has moved to a target contrib.
- Do not create `shared.css`, `common.css`, or broad media folders unless at least two features genuinely reuse the same non-business styling.
- Static images, icons, and other feature assets live under the owning feature's `browser/media/`.
- Feature CSS should be imported by that feature's `.contribution.ts`, `ViewPane`, or `View`, not by unrelated workspace/bootstrap files.
- During 旧视图 retirement, move visual state from `className` expressions into CSS driven by class, `data-*`, and ARIA attributes.
- JS may set semantic state; CSS decides color, spacing, borders, shadows, visibility, and selected/disabled styling.

Checklist for every moved UI:

- [x] Create `browser/media/<feature>View.css` only if the feature needs CSS.
- [x] Move 旧视图 `className` styling into feature CSS as part of the TypeScript view migration.
- [x] Replace stateful class string branching with class, `data-*`, or ARIA state.
- [x] Import CSS from the owning feature entry/view.
- [x] Delete old CSS from `chartPreview` or `workspace` once no owner uses it.
- [x] Keep base UI CSS in `base/browser/ui` only for genuinely generic controls.

## State And Protocol Boundary

Splitting files is not enough. State ownership must split too.

Rules:

- One state has one owner.
- Cross-contrib communication should use small explicit protocol objects, not large mutable feature internals.
- Do not pass a whole model object across contrib boundaries so another feature can mutate it.
- Do not let views update another feature's state directly.
- Put shared protocol types in `common` only when at least two features genuinely need a stable boundary.
- Keep feature-private model types inside the owning feature.

Likely cross-contrib protocols:

- `ActiveFileSelection`: active file id and optional series ids.
- `SeriesSelection`: selected file id, series id, and selection mode.
- `TemplateApplyRequest`: template config, application mode, and target file ids.
- `ChartInput`: display-ready series descriptors for chart rendering.
- `DiagnosticsInput`: chart/series state needed to compute diagnostics.
- `ExportRequest`: selected export scope, file ids, series ids, and export options.

Avoid cross-contrib payloads like:

- Raw `processedData` mutation handles.
- Whole session state.
- Controller instances.
- DOM nodes.
- Large caches owned by another feature.

If a feature needs another feature to do work, use a command/action/service request. If it only needs to respond to selection, pass a small event payload.

## Contribution Registration Boundary

Feature registration belongs in that feature's `.contribution.ts`.

Rules:

- Command ids, action ids, context keys, view ids, contribution ids, and protocol constants live in `common/<feature>.ts` when they cross files.
- Commands, actions, menus, keybindings, context keys, view registration, and service registration are wired from `browser/<feature>.contribution.ts`.
- `ViewPane`, `View`, `Controller`, `Model`, and `Service` must not register workbench entry points.
- `Page.旧视图` must not register or hard-code feature entry points.
- If a feature has no workbench registration yet, it can still have a `.contribution.ts` as the future entry point, but it must not contain business logic.

## Lifecycle And Disposal

旧视图 retirement moves lifecycle responsibility into our code. Every owner must release what it creates.

Rules:

- `ViewPane` owns the top-level `DisposableStore` for the pane.
- `ViewPane` disposes controller, view, model bindings, and local stores.
- `View` owns DOM listeners it creates.
- `Controller` owns subscriptions, async task cancellation, and service/model bindings.
- `Model` owns event emitters and model-level subscriptions.
- Switching active file, active series, template, or plot type must clear any scoped disposable store before binding the next input.
- Async work must check disposed/current request id before writing back.
- No naked `addEventListener`, `setTimeout`, `setInterval`, `ResizeObserver`, worker listener, or store subscription without a release path.

Checklist:

- [x] Add `DisposableStore` or equivalent lifecycle owner to every new non-旧 UI 框架 view/controller/model.
- [x] Clear scoped disposables when inputs switch.
- [x] Guard async write-backs after dispose or input changes.
- [x] Dispose toasts, observers, timers, and DOM listeners.

## Accessibility And Focus

The TypeScript views must keep or improve accessibility while replacing 旧视图.

Rules:

- Every view pane needs a clear ARIA label or labelled-by relationship.
- Buttons must be real buttons unless an existing base component supplies equivalent semantics.
- Tabs, toolbar controls, lists, menus, and selects need keyboard behavior and ARIA state.
- Selected, disabled, expanded, current, busy, and invalid states must update ARIA as well as CSS state.
- Empty, loading, error, and processing states must be readable by assistive tech.
- Focus must have a clear landing point after pane mount, dialog close, template apply, export completion, and onboarding step changes.

Checklist:

- [x] Define focus behavior before replacing a 旧视图 pane.
- [x] Preserve labels for controls moved from 旧 UI 框架 to DOM.
- [x] Verify keyboard navigation for new controls.
- [x] Keep visual state and ARIA state in sync.

## Performance Boundary

These features handle large files, many rows, and heavy chart calculations.

Rules:

- Do not synchronously compute diagnostics, chart series, table rows, or export payloads during DOM render.
- Large lists and tables need virtualization, paging, slicing, or incremental rendering.
- Canvas redraws need explicit invalidation triggers.
- Caches need an owner, key, invalidation rule, and release path.
- Preview/card rendering should update by diff where reasonable, not rebuild every row on every selection.
- Parameters and diagnostics should compute display models outside views.
- Worker/background work belongs behind a service or clearly owned controller.

Checklist:

- [x] Identify the heavy path before moving a UI section.
- [x] Put heavy pure calculations in model/resolver files.
- [x] Keep cache ownership local and documented.
- [x] Avoid rebuilding large DOM subtrees for small state changes.

## Migration Order

Recommended order:

1. Correct the temporary `contrib/analysis` boundary.
2. Establish contribution entry points and id files for features as they are touched.
3. Extract `template`, because it already has a clear contrib and several 旧视图 files.
4. Clean up `parameters`, because it is an existing contrib but currently owns some chart/diagnostics UI by accident.
5. Extract `export`, because side effects and ownership are relatively clear.
6. Extract `preview`, then `chart`, then `diagnostics`, because they are deeply coupled inside `AnalysisCharts.旧视图`.
7. Extract `onboarding`, replacing DOM reach-ins with commands/actions where possible.
8. Shrink `Page.旧视图` and session wiring after feature owners exist.
9. Delete compatibility shims and old 旧视图 once references are gone.

Do not split multiple heavy chains in one patch. If a change touches template, chart, diagnostics, export, and session at once, stop and make the boundary smaller.

## Compatibility And Deletion

Compatibility layers are allowed only as short-lived migration tools.

Rules:

- Every compatibility export or shim must have a deletion condition.
- Do not leave long-term re-exports from `chartPreview` to target contribs.
- Do not keep old 旧视图 wrappers once a TypeScript view exists and all callers have moved.
- Run `rg` for old paths before deleting or declaring a migration complete.
- Do not keep duplicate owners for the same state during migration.

Checklist:

- [x] Search for old imports with `rg` after each move.
- [x] Remove stale exports from index files.
- [x] Delete old CSS/media after the owning view moves.
- [x] Delete old 旧视图 files when no references remain.

## Testing Strategy

Use tests where they catch the actual risk.

Rules:

- Pure model/resolver/parser/calculation code should have focused unit tests.
- Service code should be tested with fake bridges or fake persistence when practical.
- Complex DOM interactions should move logic into models/controllers first, then test those pieces.
- UI-only migration can be manually verified if behavior is unchanged and logic is not moved.
- Layout-affecting changes should be visually checked in the app.
- Every migration patch should at least run `npm run typecheck` and eslint for touched files.

Checklist:

- [x] Add or update unit tests for new pure model/resolver logic.
- [x] Use fake bridge/persistence for service tests when side effects are changed.
- [x] Run `npm run typecheck`.
- [x] Run eslint for touched files.
- [x] Visually verify changed panes when DOM/CSS/layout changes.

## Ownership

### data

Owns:
- Data table and imported working set views.
- Preview rows/cells display.
- Extraction run entry points.
- Data-side template application trigger wiring.

Does not own:
- Template editing UI.
- Chart rendering.
- Diagnostics or exported analysis results.

Extraction processing side effects can remain in `data` while they are specific to importing/processing data. Shared lower-level worker/import capabilities should be services with clear protocols.

### template

Owns:
- Template selection and save/edit UI.
- Template preview workspace/surface/panel.
- Template validation and normalization.
- Template import/export.
- Template application intent.

Does not own:
- The actual extraction processing queue.
- Data table rendering.
- Onboarding overlay rendering.

Template application should emit a small, explicit request to data/processing. It should not directly own processing state.

### preview

Owns:
- File cards and thumbnail-like curve preview.
- Active file and active series selection UI.
- Selection model for the current working set.

Does not own:
- Main chart rendering.
- Metrics computation.
- Origin export.

### chart

Owns:
- Main plot view.
- Canvas chart rendering.
- Axis settings used by the current chart view.
- Unit conversion and chart display units while they are chart-specific.
- Plot type controls and chart-specific display model.

Move unit helpers here first if they mainly serve chart rendering. Only promote them to shared `common` after at least two contribs genuinely depend on them.

### diagnostics

Owns:
- SS diagnostics.
- gm diagnostics.
- Vth diagnostics.
- Curve probe and diagnostic panels.
- Diagnostic view models.

Pure algorithms that do not depend on DOM/browser state can live under `common` for this contrib.

### parameters

Owns:
- Calculated parameter tables.
- Metric summaries.
- RC analysis display and RC result views.
- Parameter view models.

Keep calculation/data shaping separate from DOM rendering.

Current `contrib/parameters` also contains UI that belongs elsewhere:

- `AxisSettingsPane.旧视图` should move to `chart`, because axis interaction is chart state/UI.
- `AnalysisDiagnosticsCard.旧视图` should move to `diagnostics`, because probe/diagnostic panels are diagnostic UI.
- `SsSummaryStrip.旧视图` should move to `diagnostics` if it stays tied to SS diagnostics, or to `parameters` only if it becomes a generic metric summary strip.
- `AnimatedNumberText.旧视图` should not become a parameters-owned shared widget unless parameters is its only real user; otherwise replace it with simple TypeScript DOM rendering or move a genuinely generic version to base UI after reuse exists.

Keep `parameters` focused on calculated result presentation and RC/metric summaries.

### export

Owns:
- Origin open actions from the analysis workspace.
- Origin zip export.
- Export mode/options UI.
- Export selection model and Origin selection export.

External side effects belong in controller/service code, not in views.

### settings

Owns:
- Persisted app settings.
- Language/theme.
- Origin executable path and durable Origin defaults.
- Default chart/analysis preferences.

Does not own:
- Current chart axis interaction UI.
- Current plot selection UI.
- Per-session analysis view state.

### onboarding

Owns:
- Onboarding overlay and step controller.
- Guided action orchestration.
- Onboarding-specific target lookup and focus/ring behavior.

Does not own:
- Template manager internals.
- Importer internals.
- Chart or settings internals.

Onboarding may call feature commands/actions, but should not reach into feature DOM internals except through documented onboarding target ids during migration.

## Page.旧视图 Exit Goal

`Page.旧视图` should become a workspace shell only. It should not know data, template, chart, diagnostics, parameters, export, preview, onboarding, or settings internals.

Target responsibility:

- Workspace layout.
- Top-level navigation.
- Titlebar/window actions.
- Top-level lifecycle and session wiring during migration.
- Mounting feature view panes.

It should not import:

- `DataPart`
- `TemplateManager`
- table preview internals
- `AnalysisPanel`
- `AnalysisCharts`
- `OverviewGrid`
- `MainPlotChart`
- `AnalysisDiagnosticsCard`
- `OriginExportToolbar`
- calculated parameter UI
- chart unit helpers
- onboarding controller internals
- settings controller internals

## 旧视图 Exit Rule

No new 旧视图 for these features.

Migration direction:

- New view code is TypeScript DOM code.
- New UI state is carried to CSS via class, `data-*`, and ARIA attributes.
- Existing 旧视图 may remain only as a temporary migration source.
- When touching a 旧视图 area for structural work, prefer extracting the next TypeScript view/model/controller instead of adding new 旧 UI 框架 components.
- Do not create new 旧视图 wrappers while moving files between contribs. If a migration wrapper is unavoidable, keep it temporary, named as a view pane, and include it in the checklist for removal.

Known 旧视图 retirement areas:

- `import/browser/importSessionViewlet.ts`
- `session/SessionProvider.旧视图`
- `template/TemplateManager.旧视图`
- `parameters/AnalysisDiagnosticsCard.旧视图`
- `parameters/AnimatedNumberText.旧视图`
- `parameters/AxisSettingsPane.旧视图`
- `parameters/CalculatedParametersRow.旧视图`
- `parameters/RcAnalysisToolbar.旧视图`
- `parameters/SsSummaryStrip.旧视图`
- `chartPreview/AnalysisPanel.旧视图`
- `chartPreview/components/AnalysisCharts.旧视图`
- `chartPreview/components/*Chart.旧视图`
- `chartPreview/components/OverviewGrid.旧视图`
- `chartPreview/components/FileCard.旧视图`
- `chartPreview/components/OriginExportToolbar.旧视图`
- `onboarding/Onboarding.旧视图`
- `onboarding/onboardingControllerHost.旧视图`

## Migration Checklist

### 0. Correct The Current Temporary Boundary

- [x] Remove the temporary `contrib/analysis` path or turn it into a short-lived compatibility shim only if needed.
- [x] Move `analysisViewPane` responsibility back under the feature that currently owns the implementation, or split directly into the target feature contrib.
- [x] Avoid treating `analysis` as the long-term owner.

### 1. Establish Feature Entrypoints

- [x] Create `common/<feature>.ts` for each feature only when it needs ids, command ids, context keys, view ids, protocol types, or shared constants.
- [x] Create `browser/<feature>.contribution.ts` for each feature before wiring commands/views into workbench.
- [x] Register feature contribution imports from `workbench.contributions.main.ts`.
- [x] Keep registration in `.contribution.ts`, not in view, controller, service, or `Page.旧视图`.
- [x] Decide whether the feature really needs a service before creating `I<Feature>Service`.
- [x] If a service is needed, put the interface/decorator in `common` and the browser implementation/registration in `browser`.
- [x] Keep pure calculations in model/resolver files instead of services.

### 2. Extract Preview

- [x] Move file card and file/series selection UI out of `AnalysisCharts.旧视图`.
- [x] Create `previewViewPane.ts`.
- [x] Create `previewView.ts`.
- [x] Move selection rules into `previewModel.ts` or `fileSelectionModel.ts`.
- [x] Ensure preview emits small selection events instead of mutating chart state directly.

### 3. Extract Template

- [x] Create `template/common/template.ts` if ids, commands, view ids, DTOs, or constants need a shared boundary.
- [x] Add `ITemplateService` only for template persistence/import/export and related side effects.
- [x] Register `BrowserTemplateService` from `template/browser/templateService.ts` if the service is created.
- [x] Create `template/browser/template.contribution.ts`.
- [x] Retire `template/browser/templateViewPane.ts` and mount the current template view from the workbench owner.
- [x] Replace `TemplateManager.旧视图` with `templateView.ts` plus controller/model.
- [x] Move visible table preview ownership out of `template` and into `contrib/table`.
- [x] Remove stale `TemplateManagerPreview*` runtime modules from `template`.
- [x] Keep `templateValidation.ts` as pure TypeScript template logic.
- [x] Move template import/export side effects into controller/service code.
- [x] Ensure template application emits explicit requests to data/processing rather than directly owning processing state.

### 4. Extract Data

- [x] Remove the empty data contribution once no runtime data feature remains.
- [x] Move template application processing to `template` as `ITemplateApplyService`.
- [x] Retire `data/browser/dataViewPane.ts` and keep data mounting at the workbench boundary.
- [x] Move `DataPart.ts` responsibilities into feature view/controller/model files.
- [x] Keep extraction validation and queue preparation outside the view.
- [x] Keep template application handling in template apply controller/service, with table preview data passed through a clear request boundary.

### 5. Extract Chart

- [x] Move main plot rendering out of `AnalysisCharts.旧视图`.
- [x] Create `chartViewPane.ts`.
- [x] Create `chartView.ts`.
- [x] Create `chartModel.ts` for plot type, visible series, axis state, and chart view state.
- [x] Move chart unit helpers near chart code first.
- [x] Keep units, axis normalization, and drawing helpers as pure functions unless a real cache/resource owner appears.
- [x] Move axis settings UI into chart-owned files unless it becomes global persisted settings.

### 6. Extract Diagnostics

- [x] Move SS diagnostics into diagnostics-owned files.
- [x] Move gm diagnostics into diagnostics-owned files.
- [x] Move Vth diagnostics into diagnostics-owned files.
- [x] Create `diagnosticsModel.ts` for derived diagnostic state.
- [x] Keep pure math in common/browser-neutral files.
- [x] Add `IDiagnosticsService` only if diagnostics work moves to a worker, cache, or background/progressive computation.

### 7. Extract Parameters

- [x] Create `parameters/common/parameters.ts` if ids, command ids, view ids, DTOs, or shared constants are needed.
- [x] Create `parameters/browser/parameters.contribution.ts`.
- [x] Create `parameters/browser/parametersViewPane.ts`.
- [x] Create `parameters/browser/parametersView.ts`.
- [x] Create `parameters/browser/parametersController.ts` only when actions need orchestration.
- [x] Create `parameters/browser/parametersModel.ts` for table rows, metric summaries, and display-ready parameter state.
- [x] Add `IParametersService` only if parameter or RC computation calls a worker/API/bridge.
- [x] Replace `CalculatedParametersRow.旧视图` with TypeScript DOM rendering owned by parameters.
- [x] Replace `RcAnalysisToolbar.旧视图` with TypeScript DOM rendering owned by parameters, unless RC becomes a separate contrib later.
- [x] Move RC result summary/table/chart orchestration into parameters-owned files.
- [x] Keep display formatting separate from calculation.
- [x] Move `AxisSettingsPane.旧视图` out of parameters to chart-owned files.
- [x] Move `AnalysisDiagnosticsCard.旧视图` out of parameters to diagnostics-owned files.
- [x] Decide `SsSummaryStrip.旧视图` ownership: diagnostics if SS-specific, parameters only if it becomes a generic metric summary view.
- [x] Delete old parameters 旧视图 files when no longer referenced.

### 8. Extract Export

- [x] Move Origin export toolbar into export-owned files.
- [x] Move Origin selection export into export-owned files.
- [x] Create `export/common/export.ts` with `IExportService` if export owns Origin/zip bridge side effects.
- [x] Create `export/browser/exportService.ts` for browser-side Origin/export bridge orchestration.
- [x] Create `exportController.ts` for Origin open/export side effects.
- [x] Keep export options and selection state in an export model.

### 9. Extract Onboarding

- [x] Create `onboarding/browser/onboarding.contribution.ts`.
- [x] Move onboarding controller host out of 旧视图.
- [x] Move onboarding overlay out of 旧视图.
- [x] Replace DOM click listeners with owned lifecycle-managed listeners.
- [x] Replace direct feature DOM manipulation with commands/actions where possible.
- [x] Keep only documented onboarding target ids as temporary DOM bridges.

### 10. Shrink Chart Preview

- [x] Stop importing `chartPreview/AnalysisPanel` from `Page.旧视图`.
- [x] Stop importing target feature internals from `chartPreview`.
- [x] Remove compatibility exports once callers have moved.
- [x] Delete old 旧视图 files when no longer referenced.

### 11. Shrink Template

- [x] Stop importing template 旧视图 files from data/workspace/onboarding.
- [x] Stop storing template view state in workspace-level code.
- [x] Move template session state behind template model/controller boundaries.
- [x] Delete old template 旧视图 files when no longer referenced.

### 12. Shrink Page.旧视图

- [x] Replace direct panel imports with feature view pane imports.
- [x] Move feature-specific props into feature controllers/models.
- [x] Keep only workspace shell, layout, navigation, and top-level lifecycle.
- [x] Remove feature-specific state that has a clear owner elsewhere.

### 13. Verification

- [x] Run `npm run typecheck`.
- [x] Run eslint for touched files.
- [x] If UI layout changes, verify the app visually.
- [x] For pure models/resolvers, add or update focused tests.

## Stop Conditions

Stop and reconsider before:

- Creating a new shared `common` file used by only one feature.
- Creating a top-level contrib just to hold one helper.
- Moving a file only to make the tree look tidy.
- Adding new 旧 UI 框架 during migration.
- Passing large mutable objects across contrib boundaries.

The split is done when each feature owns its view, model/controller, contribution entry, CSS, and side effects, and `Page.旧视图` no longer knows feature internals.


