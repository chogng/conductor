---
description: Conductor Studio architecture - ownership, layers, events, commands, state, domain flows, and migration boundaries.
applyTo: 'src/cs/**'
---
# Conductor Architecture

For the table URI/editor-model migration, `.github/instructions/迁移说明.md`
has higher priority than this file. If the pre-migration TableModel/TableModelService
wording here conflicts with that migration document, follow the migration
document.

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
- URI-backed model/service identity uses `resource: URI` as the core identity.
  This matches the upstream VS Code file/editor shape and remains the identity
  for filesystem, editor/model, table-open, and `IUriIdentityService` flows.
  When sheet-level identity is needed, carry `sheetId` as an adjacent optional
  field. Do not encode `sheetId` into the URI for model, command, service, file
  operation, editor, or Explorer row identity.
- Explorer row identity is the direct Conductor value
  `{ resource: URI, sheetId?: string | null }`. `ExplorerResourceIdentity` is a
  Files/Explorer row identity for selection, hover, visible rows, review/slice
  handoff, and exact file-item commands; it is not an upstream VS Code API and
  must not replace global URI semantics.
- Do not introduce or preserve public `*ResourceTarget`, `*SourceTarget`, or
  nested `{ target: { resource, sheetId } }` wrappers for resource identity;
  migrate call sites to direct `resource` / `sheetId` parameters or fields. Use
  `target` only for actual command/UI/operation targets. Row-level operations
  that can distinguish multiple sheet rows for one URI must accept the exact
  `{ resource, sheetId? }` identity; file-level side effects extract `resource`
  only at the owner boundary.
- The only allowed sheet-in-URI form is an adapter key for URI-only platform
  APIs such as decorations providers. That boundary must parse immediately back
  to `{ resource, sheetId? }`, must not be accepted by resource identity call
  sites, and must state its deletion condition.
- Views read state and translate user gestures into commands or service calls.
- Command handlers validate arguments and delegate; they do not mutate DOM or `SessionModel`.
- Contributions register things; they are not business orchestrators.

Use owner APIs like:

```ts
explorerService.select(resource, reveal?, sheetId?);
ownerService.update(resourceIdentity, update);
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
| Canonical model state | `ISessionService` ledger and domain commit APIs | imported table files, raw tables, table model, slice runs, curves, metrics |
| URI-backed domain result | The producing service | Slice results, Calculation results, Review results |
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
| `IProgressService` | cross-feature asynchronous task lifecycle and presentation-location handoff; it does not own domain readiness or result state |
| `IExplorerService` | Files Explorer UI state: resources, selection, expansion, layout, context |
| Explorer source helpers | source collection/import contracts for ordinary Explorer URI-backed imports |
| `IDataResourceService` | URI-backed Conductor data-resource snapshots: structured content, semantic title matching, X/data-block/binding evidence, sheet sub-targets, source versions, and parser diagnostics for Review/Table/Search/Slice consumers |
| `ISessionService` | migration-ledger imported data-file/raw-table records and legacy canonical analysis records |
| `IUserDataProfileResourceService` | profile-scoped user-data resources such as UserTemplate payloads; it owns profile resource persistence and import/export aggregation boundaries, not individual domain semantics |
| `IReviewService` | URI-grounded content-version review: builds `SegmentCandidate`/review candidates from DataResource binding evidence plus UserTemplate snapshots, evaluates candidates, selects `ReviewedTemplate` for table adapters, owns manual adjustment state and system-application recommendation |
| `services/template` | canonical executable Template spec, editor adapters, and manual-template UI state; it does not own automatic DataResource/UserTemplate candidate derivation |
| `IUserTemplateService` | native user template catalog CRUD/snapshots/import/export and explicit template lookup |
| `ITableService` | table source, rows, selection snapshot, reveal/highlight |
| `ITemplateViewStateService` | Template UI selected-template/form editor state |
| `ICalculationService` and helpers | URI-backed derived curves/metrics, signatures, queue, worker lifecycle, and result cache |
| `IPlotService` | plot render models, plot settings, series visibility/focus |
| `IChartService` | chart shell/view input and chart-local UI state |
| `IThumbnailService` / preview service | thumbnail bitmap cache/rendering and per-file preview lifecycle |
| `ISearchService` | search query/results/provenance |
| `IExportService` | export plan, options, artifacts |
| `IParametersService` | parameter rows and parameter display state |

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
  -> supported table resource URI / ExplorerFileEntry row
  -> Explorer-local imported rows
  -> ITableService.open({ resource })
  -> TableFileEditorModel / ITableModel snapshot/version
  -> table UI materialization consumes URI-backed model facts
  -> downstream services consume URI-backed content evidence or their own state
```

Primary review/template flow:

```txt
{ resource, sheetId? } + contentHash/sourceVersion
  -> canonical content evidence
  + DataResource binding evidence/UserTemplate snapshots
  -> SegmentCandidate / ReviewCandidate
  -> ReviewResult / ReviewedTemplate
  -> SliceResourceRequest
  -> SliceResourceResult
  -> CalculationResourceResult
  -> Plot / Parameters
```

Specific flow owners:

- Import/source collection: Explorer/files workflow coordinates source preparation; Explorer owns local visible rows and table-resource open handoff.
- Session ledger: Session backs migration-ledger imported raw-table storage and
  legacy canonical analysis records during migration. URI-backed Slice and
  Calculation results stay in their owners.
- Structured evidence / Review candidate building: DataResource produces
  resource/sheet content-version structured evidence, semantic-rules fingerprints,
  X ranges/groups, data blocks, dependent values, and binding candidates.
  Review consumes that evidence plus UserTemplate snapshots to build transient
  `SegmentCandidate` / `ReviewCandidate` values. Table UI/materialization is a
  branch on the same resource/sheet content chain, not the public Review identity. Do not
  keep retired service, record, or command names in new docs or APIs.
- Review: evaluates candidates for `{ resource, sheetId? }`, selects a
  `ReviewedTemplate` for table adapter execution when ready, and keeps Review
  results service-local.
- Explicit execution controllers and Slice commands consume
  `ReviewDecision.ready.application.systemRecommended`, apply idempotency
  guards, and submit Slice requests.
- Slice execution: Slice executes concrete reviewed/manual Template snapshots and owns resource/sheet base-curve results.
- Calculation: Calculation derives and caches resource/sheet curves/metrics from Slice results.
- Plot: Plot consumes Calculation resource results to produce render models.
- Chart: Chart hosts plot UI; it does not interpret raw session facts.
- Thumbnail: Thumbnail consumes Plot render models; it does not derive curves.
- Export: consumes Calculation/Plot/metric state through its own service.
- Parameters: consumes Calculation resource results through its own service.
- Search: consumes explicit URI structured-content snapshots plus Plot/Chart owner state.

## Canonical Session

`SessionModel` is the migration ledger for remaining imported
data-file/raw-table lifecycle and legacy canonical analysis facts. It does not
store URI-backed Slice or Calculation results.

Keep out of Session:

- URI/editor input models and format support-check results;
- table selection, focus, scroll, width, row caches;
- file preview rows, file watch/reload state, model caches, active resource/view
  input, and other service-local lifecycle state;
- chart zoom, popovers, pane visibility;
- template draft/form UI state;
- search query or selected result;
- export dialog state;
- thumbnail bitmap/preview caches;
- worker refs, request ids, transient lifecycle state.

Follow the upstream file -> editor shape for open/preview flows:

```txt
URI/resource
  -> editor/input resolver or model service
  -> model owns URI, format, load state, preview rows, cache/reload/watch
```

Those editor/input models and URI-backed Slice/Calculation results are not
Session records.

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
5. Do URI-backed domain results stay in their producing services, with Session limited to its migration-ledger contract?
6. Does the dependency direction stay within the layer rules?
7. Are subscriptions disposed?
