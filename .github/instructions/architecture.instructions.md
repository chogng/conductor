---
description: Conductor Studio architecture - ownership, layers, events, commands, state, domain flows, and migration boundaries.
applyTo: 'src/cs/**'
---
# Conductor Architecture

Use this file before adding a service, moving state, wiring a contribution, or
changing ownership. Domain-specific rules live in the matching
`*.instructions.md` file.

## Core Model

Conductor follows the VS Code registration/invocation/subscription shape:

```txt
contribution / registry / DI
  -> command/action/view invokes behavior
  -> owner service/model/controller mutates owned state
  -> owner fires onDidChangeXxx
  -> subscribers reread owner public state
  -> subscribers update their own UI or derived state
```

Keep these mechanisms separate:

| Mechanism | Rule |
| --- | --- |
| Registration | Wire services, commands, actions, views, providers, menus, keybindings, and contributions. Do not run business logic here. |
| Invocation | Commands/actions/controllers normalize input, resolve services, and call owner APIs. They do not own long-lived state. |
| Subscription | Owners publish facts through `onDidChangeXxx`. Consumers reread public state; events are not commands. |

## Ownership Rules

- The owner of state is the only component that mutates that state.
- Public APIs expose behavior and snapshots, not mutable internals.
- Target records are values; behavior lives on the owner service/model.
- Views read state and translate user gestures into commands or service calls.
- Command handlers validate arguments and delegate; they do not mutate DOM or `SessionModel`.
- Contributions register things; they are not business orchestrators.

Use owner APIs like:

```ts
ownerService.select(target, reveal?);
ownerService.update(target, update);
ownerModel.setSelection(selection);
service.getState();
```

Avoid:

```ts
target.select();
service._state.value = next;
view.callsOtherViewRefresh();
eventNamedOnShouldRefreshView();
```

Events describe facts: `onDidChangeSelection`, `onDidChangeModel`,
`onDidChangeViewState`. Avoid event names that tell consumers what to do:
`onShouldRefresh`, `onNeedRender`, `onForceUpdate`.

Subscriptions must be disposed through the owner lifecycle.

## State Kinds

| State kind | Owner | Examples |
| --- | --- | --- |
| Canonical model state | `ISessionService` and domain commit APIs | raw files, assessments, slice runs, curves, metrics |
| Domain service state | The domain service | plot settings, chart view input, template catalog state, table source/selection snapshot |
| View state | The view/widget/service that renders it | focus, local selection, template form draft, scroll, expansion, hover, layout mode |
| Derived model | Producer service | plot render model, table display profile, search model, thumbnail preview |

Do not promote local state into a global service unless it has a real
workbench-wide owner, lifecycle, and external contract.

## Selection

Selection belongs to a concrete owner. It is not global by default.

| Selection / active target | Owner |
| --- | --- |
| Explorer file/resource selection | `IExplorerService` |
| Table cell/range/column selection | `ITableService` / active table widget |
| Plot type and series visibility/focus | `IPlotService` |
| Chart pane/popover state | `IChartService` |
| Search query/result selection | `ISearchService` |
| Export options/curve state | `IExportService` |
| Parameter row/input state | `IParametersService` |

Cross-service mirroring is allowed only by reading the source owner and calling
the target owner. Do not smuggle callbacks or mutable owner behavior through
pane input records.

## Layers

Dependency direction:

```txt
workbench/contrib -> workbench/services -> platform -> base
```

| Layer | Owns | Must not do |
| --- | --- | --- |
| `base` | utilities and UI primitives | import workbench services |
| `platform` | process/platform services: commands, files, storage, context keys | know Conductor session/domain semantics |
| `workbench/services` | cross-feature domain services and canonical service APIs | import contrib views |
| `workbench/contrib` | feature UI, commands, actions, view composition | own canonical session records unless it is the domain owner |
| entry points | import/register implementations | contain business logic |

Runtime folders:

| Folder | Meaning |
| --- | --- |
| `common` | contracts, records, pure helpers; no DOM/Worker/Electron |
| `browser` | browser/DOM implementations |
| `electron-browser` | renderer-side desktop IPC/preload integrations |
| `node` | Node-only helpers |
| `electron-main` | main process implementation |

## Service Map

| Owner | Domain |
| --- | --- |
| `IFileService` | platform filesystem bytes/stat/watch/provider capability |
| `IExplorerService` | Files Explorer UI state: resources, selection, expansion, layout, context |
| `fileConverter.ts` / files service helpers | CSV/XLS/XLSX/clipboard/manual conversion into raw table records |
| `ISessionService` | canonical session ledger and change events |
| `IAssessmentService` | raw table evidence: structure, profiles, semantics, groups, blocks, diagnostics; migration name for RawTableEvidence |
| `IRecipeService` | passive built-in recipes used by Review candidate providers to derive Template drafts from raw table evidence |
| `ITemplateResolutionService` | migration bridge for deriving Recipe/UserTemplate candidates; it is not the final decision owner |
| `IReviewService` | template candidate review, selected `ReviewedTemplate`, manual adjustment state, and system-application recommendation |
| `IUserTemplateService` | native user template catalog CRUD/snapshots/import/export and explicit template lookup |
| `ITableService` | table source, rows, selection snapshot, reveal/highlight |
| `ITemplateViewStateService` | Template UI selected-template/form editor state |
| calculation services/helpers | derived curves and metrics commit payloads |
| `IPlotService` | plot render models, plot settings, series visibility/focus |
| `IChartService` | chart shell/view input and chart-local UI state |
| `IThumbnailService` / preview service | thumbnail bitmap cache/rendering and per-file preview lifecycle |
| `ISearchService` | search query/results/provenance |
| `IExportService` | export plan, options, artifacts |
| `IParametersService` | parameter rows, metric inputs, parameter display state |

## Command Dispatch

All user-visible operations enter through UI -> command/action/controller ->
owner service.

```txt
Action/menu/keybinding/local gesture
  -> ICommandService / CommandsRegistry handler
  -> optional feature controller
  -> owner service API
  -> optional ISessionService commit
  -> owner events
  -> subscribers reread public state
```

Use:

- `registerAction2` for user-visible menu/toolbar/keybinding/Command Palette entries.
- `CommandsRegistry.registerCommand` for callable logical operations without UI metadata.
- runtime `Action` only for mutable UI affordances with live label/enabled/checked state.

Do not register the same id through both `registerAction2` and
`CommandsRegistry.registerCommand`. Read `commands.instructions.md` before
editing command ids, handlers, menus, keybindings, or action registration.

## Data Flow

High-level analysis flow:

```txt
Explorer source workflow
  -> fileConverter.ts FileConversionResult
  -> ISessionService.commitFileImport
  -> SessionChangeEvent
  -> Assessment/Table/Template/Plot/Search/Export/Parameters subscribers
  -> downstream services reread SessionSnapshot and own their state
```

Specific flow owners:

- Import/source collection: Explorer/files workflow coordinates; converter returns results; Session commits.
- RawTableEvidence: Assessment service currently reads raw tables and commits evidence-shaped assessment records; long term this moves to RawTableEvidence naming.
- Review: consumes raw table evidence plus current Recipe/UserTemplate snapshots, reviews Template candidates, and commits `RawTableReviewRecord` decisions.
- ReviewApply: consumes `ReviewDecision.ready.application.systemRecommended`, applies idempotency guards, and submits Slice requests.
- Slice execution: Slice executes concrete reviewed/manual Template snapshots and commits SliceRun/series/base curves.
- Calculation: calculation services derive curves/metrics and commit through Session.
- Plot: Plot consumes canonical curves/metrics and produces render models.
- Chart: Chart hosts plot UI; it does not interpret raw session facts.
- Thumbnail: Thumbnail consumes Plot render models; it does not derive curves.
- Export/Search/Parameters: consume Session/Plot/metric state through their own services.

## Canonical Session

`SessionModel` is the canonical in-memory ledger. It stores imported files,
raw tables, assessments, slice runs, series, curves, metrics, metric inputs,
and rebuildable calculation cache descriptors.

Keep out of Session:

- table selection, focus, scroll, width, row caches;
- chart zoom, popovers, pane visibility;
- template draft/form UI state;
- search query or selected result;
- export dialog state;
- thumbnail bitmap/preview caches;
- worker refs, request ids, transient lifecycle state.

Use `records.instructions.md` for record/state field ownership and invalidation.

## File Layout

- Registration: `*.contribution.ts`, action registration files, service registration entry points.
- Command handlers: `<feature>Commands.ts` or `<feature>Actions.ts` for small handlers.
- State owners: `<domain>Service.ts`, model/store/controller/provider/reader/cache files named by responsibility.
- View rendering: `views/**`, widgets, panes.
- Cross-domain projection: explicit workbench bridge code, not hidden callbacks in pane inputs.

Do not add a `Manager` or generic `Controller` to avoid naming the real owner.
Use service component names from `service-components.instructions.md`.

## Migration Rules

- Preserve upstream VS Code shape when a responsibility has a counterpart.
- Conductor-specific APIs must be explicit about the owning domain.
- Move code by responsibility, not by closest name.
- During bug fixes, trace the symptom to the entry point, owner, and incorrect owner behavior before editing.
- If behavior has an upstream counterpart, inspect upstream and either follow it or document why Conductor diverges.
- Update matching module sequence diagrams only when the behavior/call flow actually changes.

## Architecture Checklist

Before approving a change, verify:
1. Is the feature registered through the correct contribution/registry/DI entry?
2. Does user intent enter through a command/action/controller or owner API?
3. Does only the owner mutate the state?
4. Are events facts, with subscribers rereading public state?
5. Are canonical facts in Session and view/service state outside Session?
6. Does the dependency direction stay within the layer rules?
7. Are record fields documented in `records.instructions.md` when shared?
8. Are subscriptions disposed?

## State and Layers

| State kind | Owner | Examples |
| --- | --- | --- |
| Canonical model state | `ISessionService` and domain commit APIs | raw files, assessments, slice runs, curves, metrics |
| Domain service state | The domain service | plot settings, chart view input, template catalog state, table source/selection snapshot |
| View state | The view/widget/service that renders it | focus, local selection, template form draft, scroll, expansion, hover, layout mode |
| Derived model | Producer service | plot render model, table display profile, search model, thumbnail preview |

Do not promote local state into a global service unless it has a real workbench-wide owner, lifecycle, and external contract.

## Selection

Selection belongs to a concrete owner. It is not global by default.

| Selection / active target | Owner |
| --- | --- |
| Explorer file/resource selection | `IExplorerService` |
| Table cell/range/column selection | `ITableService` / active table widget |
| Plot type and series visibility/focus | `IPlotService` |
| Chart pane/popover state | `IChartService` |
| Search query/result selection | `ISearchService` |
| Export options/curve state | `IExportService` |
| Parameter row/input state | `IParametersService` |

Cross-service mirroring is allowed only by reading the source owner and calling the target owner. Do not smuggle callbacks or mutable owner behavior through pane input records.

## Layers

Dependency direction:

```txt
workbench/contrib -> workbench/services -> platform -> base
```

| Layer | Owns | Must not do |
| --- | --- | --- |
| `base` | utilities and UI primitives | import workbench services |
| `platform` | process/platform services: commands, files, storage, context keys | know Conductor session/domain semantics |
| `workbench/services` | cross-feature domain services and canonical service APIs | import contrib views |
| `workbench/contrib` | feature UI, commands, actions, view composition | own canonical session records unless it is the domain owner |
| entry points | import/register implementations | contain business logic |

Runtime folders:

| Folder | Meaning |
| --- | --- |
| `common` | contracts, records, pure helpers; no DOM/Worker/Electron |
| `browser` | browser/DOM implementations |
| `electron-browser` | renderer-side desktop IPC/preload integrations |
| `node` | Node-only helpers |
| `electron-main` | main process implementation |

## Service Map

| Owner | Domain |
| --- | --- |
| `IFileService` | platform filesystem bytes/stat/watch/provider capability |
| `IExplorerService` | Files Explorer UI state: resources, selection, expansion, layout, context |
| `fileConverter.ts` / files service helpers | CSV/XLS/XLSX/clipboard/manual conversion into raw table records |
| `ISessionService` | canonical session ledger and change events |
| `IAssessmentService` | raw table interpretation: groups, blocks, roles, diagnostics |
| `ITableService` | table source, rows, selection snapshot, reveal/highlight |
| `IUserTemplateService` | native user template catalog CRUD/snapshots/import/export and explicit template lookup |
| `ITemplateViewStateService` | Template UI selected-template/form editor state |
| calculation services/helpers | derived curves and metrics commit payloads |
| `IPlotService` | plot render models, plot settings, series visibility/focus |
| `IChartService` | chart shell/view input and chart-local UI state |
| `IThumbnailService` / preview service | thumbnail bitmap cache/rendering and per-file preview lifecycle |
| `ISearchService` | search query/results/provenance |
| `IExportService` | export plan, options, artifacts |
| `IParametersService` | parameter rows, metric inputs, parameter display state |

## Command Dispatch

All user-visible operations enter through UI -> command/action/controller ->
owner service.

```txt
Action/menu/keybinding/local gesture
  -> ICommandService / CommandsRegistry handler
  -> optional feature controller
  -> owner service API
  -> optional ISessionService commit
  -> owner events
  -> subscribers reread public state
```

Use:

- `registerAction2` for user-visible menu/toolbar/keybinding/Command Palette entries.
- `CommandsRegistry.registerCommand` for callable logical operations without UI metadata.
- runtime `Action` only for mutable UI affordances with live label/enabled/checked state.

Do not register the same id through both `registerAction2` and
`CommandsRegistry.registerCommand`. Read `commands.instructions.md` before
editing command ids, handlers, menus, keybindings, or action registration.

## Data Flow

High-level analysis flow:

```txt
Explorer source workflow
  -> fileConverter.ts FileConversionResult
  -> ISessionService.commitFileImport
  -> SessionChangeEvent
  -> Assessment/Table/Template/Plot/Search/Export/Parameters subscribers
  -> downstream services reread SessionSnapshot and own their state
```

Specific flow owners:

- Import/source collection: Explorer/files workflow coordinates; converter returns results; Session commits.
- Assessment: Assessment service reads raw tables and commits assessment records.
- Slice execution: Slice reads Assessment evidence plus current Recipe/manual Template state and commits SliceRun/series/base curves.
- Calculation: calculation services derive curves/metrics and commit through Session.
- Plot: Plot consumes canonical curves/metrics and produces render models.
- Chart: Chart hosts plot UI; it does not interpret raw session facts.
- Thumbnail: Thumbnail consumes Plot render models; it does not derive curves.
- Export/Search/Parameters: consume Session/Plot/metric state through their own services.

## Canonical Session

`SessionModel` is the canonical in-memory ledger. It stores imported files,
raw tables, assessments, slice runs, series, curves, metrics, metric inputs,
and rebuildable calculation cache descriptors.

Keep out of Session:

- table selection, focus, scroll, width, row caches;
- chart zoom, popovers, pane visibility;
- template draft/form UI state;
- search query or selected result;
- export dialog state;
- thumbnail bitmap/preview caches;
- worker refs, request ids, transient lifecycle state.

Use `records.instructions.md` for record/state field ownership and invalidation.

## File Layout

- Registration: `*.contribution.ts`, action registration files, service registration entry points.
- Command handlers: `<feature>Commands.ts` or `<feature>Actions.ts` for small handlers.
- State owners: `<domain>Service.ts`, model/store/controller/provider/reader/cache files named by responsibility.
- View rendering: `views/**`, widgets, panes.
- Cross-domain projection: explicit workbench bridge code, not hidden callbacks in pane inputs.

Do not add a `Manager` or generic `Controller` to avoid naming the real owner.
Use service component names from `service-components.instructions.md`.

## Migration Rules

- Preserve upstream VS Code shape when a responsibility has a counterpart.
- Conductor-specific APIs must be explicit about the owning domain.
- Move code by responsibility, not by closest name.
- During bug fixes, trace the symptom to the entry point, owner, and incorrect owner behavior before editing.
- If behavior has an upstream counterpart, inspect upstream and either follow it or document why Conductor diverges.
- Update matching module sequence diagrams only when the behavior/call flow actually changes.

## Architecture Checklist

Before approving a change, verify:
1. Is the feature registered through the correct contribution/registry/DI entry?
2. Does user intent enter through a command/action/controller or owner API?
3. Does only the owner mutate the state?
4. Are events facts, with subscribers rereading public state?
5. Are canonical facts in Session and view/service state outside Session?
6. Does the dependency direction stay within the layer rules?
7. Are record fields documented in `records.instructions.md` when shared?
8. Are subscriptions disposed?
