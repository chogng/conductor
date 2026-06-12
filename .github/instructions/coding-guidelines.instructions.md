---
description: Coding guidelines for Conductor workbench contributions — commands vs actions, Action vs Action2, files/explorer/import naming, service component names, and migration boundaries.
applyTo: 'src/cs/**'
---
# Coding Guidelines

Use these rules when adding or refactoring Conductor workbench code. They follow the same intent as the VS Code codebase: keep command entry, UI affordances, service state, view rendering, and platform capability separated.

## 1. Decide whether the change is a command, an action, or a local UI action

Before choosing `CommandsRegistry.registerCommand(...)`, `registerAction2(...)`, or a runtime `Action`, first classify the user need.

Ask:

1. Is this a callable logical operation that other code may execute without UI?
2. Does it need a button, menu item, context menu item, keybinding, or Command Palette entry?
3. Does the UI object itself need mutable runtime state such as `label`, `tooltip`, `enabled`, `checked`, or `onDidChange`?

Use this decision table:

| Need | Prefer | Reason |
| --- | --- | --- |
| Callable logic entry only | `CommandsRegistry.registerCommand(...)` | Command is the lowest executable entry point. It may have metadata but does not imply UI placement. |
| Button/menu/keybinding/Command Palette/context menu | `registerAction2(class X extends Action2 { ... })` | `Action2` declares command id, title, menu, keybinding, category, precondition/when, and telemetry semantics in one registration. |
| A UI component needs a mutable clickable object | `new Action(...)` or a class implementing `IAction` | Runtime `Action` is an action instance with mutable state and change events. |
| View-local click handler with no reuse and no cross-service effect | Local callback | Do not create a command for temporary DOM-only behavior. |

## 2. Command is the executable base layer

A command is the lowest shared executable entry point.

Use `CommandsRegistry.registerCommand(...)` when:

- the operation is callable from tests, controllers, or another command;
- there is no UI metadata yet;
- the command should not automatically appear in a menu, toolbar, Command Palette, or keybinding;
- the operation is internal or migration-only.

Command handlers should only normalize input and dispatch to services/controllers.

Command/action IDs should name the owning operation, not the UI entry point
that invokes it. Do not create ids such as `titlebar.selectFile` for behavior
owned by Files/Explorer or workbench mode switching. UI-location names are
acceptable for DOM ids, CSS hooks, and local test selectors, but shared
commands should use owner/mode vocabulary such as `table`, `chart`, `files`,
`explorer`, or the concrete service operation.

When an upstream feature exposes a service method for a user operation, preserve that split: register commands/actions for workbench entry points, and keep the operation on the service. Command handlers should normalize inputs and call the service method; they should not become the owner of selection, focus, layout, or workflow state.

Example: upstream Explorer reveal/select commands call `IExplorerService.select(resource, reveal?)`. The command is the executable entry point, while Explorer selection/reveal state remains owned by the Explorer service/view.

```ts
CommandsRegistry.registerCommand({
  id: ExplorerCommandId.RevealResource,
  metadata: {
    description: localize('explorer.revealResource', 'Reveal Resource'),
  },
  handler: async (accessor, rawResource?: unknown) => {
    const explorerService = accessor.get(IExplorerService);
    const resource = normalizeExplorerResource(rawResource);

    if (!resource) {
      return;
    }

    await explorerService.select(resource, 'force');
  },
});
```

Do not put business logic in the handler. The handler is not the owner of Explorer state, Session state, Plot state, or Table state. When a feature has an upstream counterpart, use the actual upstream service surface. Do not invent service methods from a conceptual responsibility; mark any Conductor-specific API explicitly.

## 3. Action2 is a declarative command contribution

Use `Action2` with `registerAction2(...)` when the feature needs UI registration semantics.

Typical `Action2` responsibilities:

- declare command id;
- provide title and optional short title;
- place the command in menus or context menus;
- expose the command to the Command Palette;
- define keybindings;
- define `when` / `precondition` context-key rules;
- attach category / f1 / telemetry semantics.

Pattern:

```ts
registerAction2(class ToggleExplorerThumbnailLayoutAction extends Action2 {
  constructor() {
    super({
      id: ExplorerCommandId.ToggleThumbnailLayout,
      title: localize2('explorer.toggleThumbnailLayout', 'Toggle Thumbnail View'),
      category: localize2('explorer.category', 'Explorer'),
      f1: true,
      menu: [{ id: MenuId.ViewTitle, when: ExplorerContextKeys.visible }],
      keybinding: {
        primary: KeyMod.CtrlCmd | KeyCode.KeyT,
        when: ExplorerContextKeys.focused,
        weight: KeybindingWeight.WorkbenchContrib,
      },
    });
  }

  run(accessor: ServicesAccessor): void {
    accessor.get(ICommandService).executeCommand(ExplorerCommandId.ToggleThumbnailLayout);
  }
});
```

`Action2` should delegate to a command or service. It should not duplicate command logic.

## 4. Runtime Action is a mutable UI action object

Runtime `Action` is an object instance used by UI components. It can carry mutable state such as:

- `label`;
- `tooltip`;
- `enabled`;
- `checked`;
- CSS class/icon data;
- `onDidChange` notifications.

Use runtime `Action` when an ActionBar, button, dropdown, menu adapter, or component expects an `IAction` object and needs live state updates.

Pattern:

```ts
const action = new Action(
  ChartActionId.ToggleLegend,
  localize('chart.toggleLegend', 'Legend'),
  'chart-legend-action',
  chartService.canToggleLegend,
  () => chartService.toggleLegend(),
);

chartService.onDidChangeChartState(() => {
  action.enabled = chartService.canToggleLegend;
  action.checked = chartService.isLegendVisible;
});
```

Do not try to replace this with `Action2` if the UI component needs a live `IAction` instance.

## 5. Action and Action2 are not interchangeable

Remember:

```txt
Action  = a runtime action object
Action2 = a declarative command/menu/keybinding registration
```

`Action2` eventually registers a command, but it is not itself a mutable UI object. `Action` is still valid for UI component integration even if new command contributions prefer `Action2`.

Practical rule:

- new command/menu/keybinding/Command Palette entry -> prefer `Action2`;
- local UI object with changing enabled/checked/label state -> use `Action` / `IAction`;
- bare callable operation -> use `CommandsRegistry.registerCommand(...)`.

## 6. Do not register UI actions before understanding the user intent

Do not start by asking “should I use Action2?” Start by asking what the user can do.

Examples:

| User need | Correct entry |
| --- | --- |
| User clicks Explorer toolbar import button | `Action2` or view action executes a Conductor-specific add-data command registered from `fileActions.contribution.ts` |
| TemplateApplyController needs to run import logic internally | command or direct controller/service call, no Action2 required |
| Test wants to invoke a behavior without UI | command or service method |
| A chart legend button changes enabled/checked live | runtime `Action` may be correct |
| A table row hover expands a temporary popover | local callback, no command/action |

## 7. Command handlers dispatch to services, not views

The target architecture is:

```txt
button/menu/keybinding/context menu
  -> Action2 or UI action
  -> command id
  -> command handler
  -> controller if workflow is multi-step
  -> service method
  -> service/session event
  -> view render
```

Do not make command handlers reach into view objects after migration.

Legacy migration bridge, now avoided:

```ts
accessor.get(IViewsService).getViewWithId<ExplorerViewPane>(ExplorerViewId)?.refresh();
```

Target state should use the actual upstream-shaped service surface for Explorer view/model behavior:

```ts
accessor.get(IExplorerService).select(resource, 'force');
```

If a command currently calls an Explorer view object directly, mark it as
migration-only and move Explorer view/model behavior into `IExplorerService` or
the upstream-aligned action/handler path. Do not create placeholder methods such
as `removeResources(...)`, `setSelection(...)`, or `setLayout(...)` unless the
new API is explicitly Conductor-specific and justified.

## 8. Files capability vs Explorer UI vs FileService naming

Follow the upstream shape: files is the capability and feature/container area; Explorer is the primary UI view inside it. Do not introduce a second files-view service parallel to `IExplorerService`.

| Name | Meaning | Use when |
| --- | --- | --- |
| `IFileService` | Platform filesystem capability | read, write, stat, watch, provider registration, path-backed IO. |
| `files` module | Workbench files capability and feature/container area for data files and file-related contributions | contribution folder, files container host, source collection/file transfer workflow, compatibility with existing `contrib/files`. |
| `IExplorerService` | Explorer interaction state | tree model, selected/revealed resource, expanded folders, drag/drop source workflow state, layout mode. |
| `ExplorerView` / `ExplorerViewer` | UI view/rendering inside the files container | DOM, ObjectTree, row templates, hover, context menu rendering. |
| `fileImportExport.ts` | File transfer and source collection helpers | folder/drop/dialog source collection, external upload/download workflow, bridge to conversion without owning parsing. |
| `fileConverter.ts` | Raw conversion utility/module | CSV/XLS/XLSX/clipboard -> raw table rows/artifacts. |

Rule:

```txt
Disk/filesystem API      -> IFileService
Explorer UI state       -> IExplorerService / ExplorerView
Files capability area   -> files
Source collection        -> fileImportExport
Data conversion          -> fileConverter, not a new IFileImportService by default
```

## 9. Do not invent `IFileImportService` unless the abstraction is proven

Do not introduce `IFileImportService` as the default target now.

Current direction:

- `fileImportPipeline.ts` can retire;
- `fileConversion.ts` and `xlsxConversionWorker.ts` should converge into `fileConverter.ts` or `fileConverter.worker.ts`;
- `filePreviewService.ts` is optional and should be re-evaluated after TableService owns raw table preview;
- desktop/browser upload workflows belong to file transfer/source collection helpers, not a generalized import service by default;
- Explorer orchestrates user intent, conversion code converts, Session commits canonical records.

Preferred shape:

```txt
contrib/files/browser/fileImportExport.ts
  collect file/drop/folder sources and host upload/download/file-transfer helpers

services/files/browser/fileConverter.ts
  convert data sources into FileConversionResult / RawTableRecord payloads

services/files/browser/fileConverter.worker.ts
  optional worker for xls/xlsx conversion

contrib/files/browser/fileActions.ts
contrib/files/browser/fileActions.contribution.ts
  register and implement Explorer add-data actions and commands

contrib/files/common/explorerModel.ts
  define Explorer resource/item model and tree helpers

services/session/browser/sessionService.ts
  commitFileImport(...)
```

Do not make `fileConverter` commit session. Do not make Explorer view or service code parse xlsx. Do not make Session read files from disk.

## 10. Import naming rule

When naming import code, distinguish files capability from Explorer UI orchestration and raw conversion.

Use user-facing `Import` labels when the user is adding data files:

- import files;
- import folder;
- add/import data files;
- CSV/Excel/Clipboard conversion.

Use precise internal names for the actual responsibility:

- source collection;
- file conversion;
- file transfer / upload / download;
- session commit;
- Explorer selection/reveal.

Examples:

| Proposed name | Use? | Reason |
| --- | --- | --- |
| `fileImportExport.ts` | Yes | Upstream-aligned file transfer/source collection helper. |
| `fileConverter.ts` | Yes | Describes conversion, not UI or service ownership. |
| `fileActions.ts` | Yes | Upstream-aligned action/handler location. |
| `fileActions.contribution.ts` | Yes | Upstream-aligned command/menu/keybinding/action registration location. |
| `explorerImportController.ts` | No by default | Prefer upstream-aligned `fileActions.ts` / `fileImportExport.ts` workflow helpers before adding a controller. |
| `IFileImportService` | No by default | Too broad; no stable interface need yet. |
| `FileView` | No | Use Files container / Explorer view terminology instead. |
| `ExplorerView` | Yes | Matches actual UI role. |

## 11. Manager naming rules

Avoid manager chains.

Do not write:

```txt
ExplorerManager
  ImportManager
  SelectionManager
  FolderManager
  ThumbnailManager
```

Use explicit roles:

```txt
ExplorerService
  owns Explorer view/model state and upstream-shaped Explorer operations

fileActions.ts / fileActions.contribution.ts
  register and implement Explorer commands/actions

common/explorerModel.ts
  Explorer resource/item model and tree helpers

ThumbnailService
  thumbnail bitmap/render cache owner
```

Allowed component suffixes:

| Suffix | Meaning |
| --- | --- |
| `Service` | DI boundary and long-lived state owner. |
| `Controller` | User/workflow orchestration; may coordinate dialogs, progress, workers, and multiple services. |
| `Store` | Local mutable state holder, usually service-local or view-local. |
| `Model` | Pure projection/read model/render model; no side effects. |
| `Provider` | External capability provider. |
| `Reader` | Data reader with a narrow read-only purpose. |
| `Adapter` | Converts legacy/new shapes across boundaries. |
| `Planner` | Builds an execution/export/render plan without performing it. |
| `Cache` | Rebuildable memoized data, never canonical truth. |

Only use `Manager` when none of these names is accurate. That should be rare.

## 12. Owner-driven service APIs across contrib/services

This rule applies to every `src/cs/workbench/contrib/**` and
`src/cs/workbench/services/**` boundary, not only Files or Table.

When code acts on a domain object, keep behavior on the owner service, model,
controller, or primitive. The object being acted on is a pure target/value
record. It does not call services, own side effects, or mutate state.

Preferred shape:

```txt
ownerService.select(target, reveal?)
ownerService.reveal(target, options?)
ownerService.open(target, options?)
ownerService.update(target, update)
ownerModel.setSelection(selection)
ownerController.run(input)
```

Avoid:

```txt
target.select()
cell.reveal()
row.open()
curve.toggle()
paneInput.onSelect(target)
```

Use domain-owned target names such as `ExplorerSelectionTarget`,
`TableSelectionTarget`, `SearchResultTarget`, `PlotSeriesTarget`,
`ExportCurveTarget`, or `ParameterRowTarget` when the target is part of the
owner's public contract. Do not introduce these names as a parallel abstraction
when an existing upstream-shaped method or local service API already expresses
the operation.

The owner validates and normalizes the target, mutates only its owned state,
fires the matching `onDidChangeXxx` event, and lets subscribers reread public
state. Commands, actions, views, and gestures may construct targets and invoke
owner APIs, but they are entry/translation layers, not state owners.

Examples by responsibility:

| Responsibility | Owner API location | Entry/consumer behavior |
| --- | --- | --- |
| Explorer resource selection/reveal | `IExplorerService` | Commands/views pass an Explorer resource target. |
| Table cell/range/column selection | `ITableService` or `TableModel` | Table gestures pass table targets; views render selection events. |
| Plot type, scale, unit, series visibility | `IPlotService` | Chart/toolbars invoke Plot-owned APIs instead of mutating chart data. |
| Chart pane, legend, inspector state | `IChartService` | Chart views invoke Chart-owned APIs and subscribe to chart state. |
| Search query and selected result | `ISearchService` | Search views update query/result state through Search service. |
| Export selected curves and options | `IExportService` | Export views pass export targets/options to Export service. |
| Parameter row selection and metric input UI state | `IParametersService` | Parameter views invoke Parameters-owned APIs. |

## 13. Cross-service selection mirroring

When one domain needs to reflect another domain's active item, keep ownership
with the original domain and mirror through an explicit bridge. Do not move the
state into a shared object, do not name the receiving service input after the
source service's state, and do not make the source service call the receiving
service's private lifecycle methods.

Use the upstream Explorer/Editor pattern:

```txt
EditorService owns activeEditor.
ExplorerView listens to EditorService.onDidActiveEditorChange.
ExplorerView derives the active editor resource.
ExplorerView calls ExplorerService.select(resource, reveal).
ExplorerService owns Explorer selection/reveal and calls ExplorerView.selectResource(...).
```

Applied to Conductor:

```txt
Explorer owns selected Explorer resource.
Table owns current TableSource, preview lifecycle, and table selection.
Workbench or a feature view may translate selected Explorer resource -> TableSource.
TableService.update(...) receives source: TableSource | null, not selectedFileId.
Files/Explorer must not call Table preview invalidation or row-cache methods.
```

For selection and reveal APIs, follow the upstream owner-driven shape:

```txt
ownerService.select(target, reveal?)
ownerService.reveal(target, options?)
```

The selected target must be a pure reference/value object. It must not own side
effects or call services itself.

Prefer:

```ts
explorerService.select(resource, "force");
tableService.select(target, "force");
tableModel.setSelection(selection);
```

Avoid:

```ts
resource.select();
tableCell.select();
range.reveal();
```

Use explicit target names that belong to the owner domain, such as
`ExplorerSelectionTarget`, `TableSelectionTarget`, `TableCell`, or
`TableRange`. The service or model that owns the state validates the target,
normalizes it, mutates selection state, fires `onDidChangeSelection`, and only
then notifies views. Views and commands may create targets, but they must not
turn target records into behavior objects.

Practical rules:

- The owner service names state in its own vocabulary.
- A bridge translates source-domain state into target-domain input.
- Commands may bridge domains, but the target service still owns its state.
- Do not add callback fields to pane input just to bounce a selection across services.
- Do not call another service's cache invalidation, preview reset, worker reset, or private lifecycle methods from a source-domain selection handler.

## 14. Service dependency import style

Follow the upstream VS Code service symbol pattern for DI services. A service
identifier usually exports both a runtime decorator value and a TypeScript
interface with the same name:

```ts
export const IFileService = createDecorator<IFileService>('fileService');

export interface IFileService {
  // service API
}
```

Consumers should import that service symbol once and use the same name in both
positions:

```ts
import { IFileService } from 'src/cs/platform/files/common/files';

class ExplorerViewPane {
  constructor(
    @IFileService private readonly fileService: IFileService,
  ) { }
}
```

Do not split the same DI service symbol into a value import plus an aliased type
import:

```ts
import {
  IFileService,
  type IFileService as IFileServiceType,
} from 'src/cs/platform/files/common/files';
```

Use `type` imports for pure type-only symbols that have no runtime role, such
as records, props, options, and helper interfaces. Named imports from a module
may still mix runtime values and `type` entries when different exported symbols
are needed.

## 15. Service and contribution dependencies

Allowed direction:

```txt
platform service -> no workbench imports
workbench service -> platform services + session snapshots + other service interfaces
contrib command/action -> service interfaces
view -> service/view model props and commands
```

Avoid:

```txt
service -> view
service -> CommandsRegistry
session -> table/chart/template UI state
converter -> assessment/template/plot logic
plot -> chart DOM
chart -> raw table parsing
```

## 16. Register, invoke, subscribe

Conductor's core interaction pattern is:

```txt
contribution / registry / DI
  -> register service / command / action / view / provider
  -> command/action invoked
  -> service method called
  -> owned state changed
  -> event fired
  -> listener reads current state and updates itself
```

Register capabilities before consumers need them. Commands and actions are entry
layers that invoke service APIs; they are not state owners. Publish state changes
through the owning service's events, and let consumers decide whether to
subscribe and how to consume the owner's public state or service surface.

Events are for broadcasting state changes and notifications. Do not use events
as hidden command dispatch, workflow control flow, or a way to make one
component mutate another component's private state.

Read `architecture.instructions.md` for the full registration,
invocation, subscription, owner, event, view, selection, model/view-state, and
disposable rules.

## 17. Migration comments

When keeping legacy code during migration, annotate the boundary:

```ts
// TODO(conductor-architecture): Migration bridge.
// This command currently calls ExplorerViewPane because IExplorerService is not wired yet.
// Move the behavior into IExplorerService and keep this handler as argument normalization only.
```

Do not leave ambiguous generic TODOs such as:

```ts
// TODO: clean up later
```

## 18. Shared values follow ownership

Shared constants should follow the same ownership and import-direction rules as
code. A value should live with the component, service, contribution, or common
contract that owns its meaning.

Use these rules before extracting constants:

- Keep implementation details private to the file or module that owns the
  behavior, even when the value is reused locally.
- Export values from a service or common contract only when callers genuinely
  depend on that value as part of the API.
- Keep UI ids, labels, CSS hooks, and aria relationships with the UI surface or
  contribution that renders or registers them.
- Keep storage keys with the service or part that reads and writes the stored
  state, unless the key is intentionally part of a migration or persistence
  contract.
- Do not add a separate constants module merely to avoid deciding ownership.
  A constants-only file is appropriate only when it represents a real shared
  contract for that folder or domain.

When a value appears to be needed across layers, first check whether one layer
should consume an owner API instead of importing the value directly. Prefer
upstream-shaped ownership over parallel exported constants.

## 19. Root-cause fix discipline

Bug fixes must start from the behavior owner, not from the visible symptom.

Before editing code for a bug, write down the concrete chain:

```txt
user symptom
  -> UI/event entry point
  -> command/action/controller/widget path
  -> service/component/primitive that owns the state or lifecycle
  -> incorrect owner behavior
```

If the chain crosses shared infrastructure such as hover, context menus,
ActionBar, dropdowns, view containers, layout, commands, storage, file service,
or session events, the shared infrastructure is the first fix candidate. Do not
change an individual view, CSS rule, button, or caller until you have proven
that the local surface owns the behavior.

When the owner has a VS Code upstream counterpart, inspect the upstream
implementation under `C:\Users\lanxi\Desktop\vscode` before editing. The fix
should preserve upstream semantics and API shape unless Conductor has an
explicit product reason to diverge. If diverging, state the reason in the
implementation notes or final response.

Do not call the work complete until the regression test exercises the owner
contract or the original shared path. A test that only asserts the local symptom
is acceptable only when the local component is the owner. For cross-cutting
bugs, add or update tests at the shared owner boundary and, when practical, add
one integration-style test for the original UI path that exposed the bug.

Root-cause fixes should change the owner semantics. Workarounds should be
rejected unless they are explicitly temporary, documented as migration bridges,
and paired with an owner-level follow-up. Examples of workarounds:

```txt
local boolean flags that duplicate platform lifecycle
CSS that hides a widget instead of fixing when it is shown
caller-specific guards around a shared service bug
new command IDs or service methods that bypass the existing owner
```

## 20. No local patches over owner behavior

Do not fix cross-cutting behavior with a local workaround when an owning
service, platform primitive, or upstream-shaped lifecycle already exists.

If a bug appears in one view but is caused by shared infrastructure or a shared
interaction contract, first identify the owner and fix or consume that owner.
The local view may subscribe to the owner for its own state cleanup, but it must
not become the source of truth for the shared behavior.

Avoid patterns such as:

```ts
// Bad: local flag duplicates a platform menu lifecycle.
private isFileContextMenuOpen = false;

showLocalContextMenu() {
  this.isFileContextMenuOpen = true;
  contextMenuService.showContextMenu({
    onHide: () => this.isFileContextMenuOpen = false,
  });
}
```

Prefer:

```ts
// Good: local state follows the owner event.
this._register(contextMenuService.onDidShowContextMenu(() => this.hideHover()));
this._register(contextMenuService.onDidHideContextMenu(() => this.updateHoverState()));
```

For platform-wide interaction behavior, prefer an upstream-aligned platform fix
over feature-specific guards. Feature code should only handle feature-owned
cleanup or presentation state after consuming the platform event/API.

## 21. NLS key naming

NLS keys should describe stable product ownership and user-facing meaning, not
the implementation class or file that currently renders the string.

Use this shape:

```txt
domain.feature.message
```

Where:

- `domain` is the owning feature or platform area, such as `files`, `chart`,
  `table`, `template`, `quickInput`, or `titlebar`;
- `feature` is an optional workflow, view, item group, or sub-feature, such as
  `import`, `actions`, `item`, `commands`, or `mode`;
- `message` names the specific stable text meaning, such as
  `failedToReadFiles`, `pickFolderTitle`, `delete`, or `showCommands`.

Prefer:

```ts
localize("files.import.failedToReadFiles", "Failed to read {count} file(s).")
localize("files.item.delete", "Delete")
localize("chart.views.search", "Search")
localize("titlebar.mode.chart", "Chart")
```

Avoid broad, ownerless keys:

```ts
localize("import.failedToReadFiles", "Failed to read {count} file(s).")
```

Avoid implementation-shaped keys that would need to change when a class or file
is refactored:

```ts
localize("fileImportExport.failedToReadFiles", "Failed to read {count} file(s).")
```

Use `files.import.*` for the Explorer data-file import/source-collection
workflow. Keep top-level `files.*` for Files/Explorer-wide labels and
`files.item.*` or `files.actions.*` for file item labels and command/action
descriptions.
