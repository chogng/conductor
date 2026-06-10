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

Allowed during migration:

```ts
accessor.get(IViewsService).getViewWithId<FilesPaneHost>(FilesViewId)?.removeFile(fileId);
```

Target state should use the actual upstream-shaped service surface for Explorer view/model behavior:

```ts
accessor.get(IExplorerService).select(resource, 'force');
```

If a command currently calls `FilesPaneHost`, mark it as migration-only and move Explorer view/model behavior into `IExplorerService` or the upstream-aligned action/handler path. Do not create placeholder methods such as `removeResources(...)`, `setSelection(...)`, or `setLayout(...)` unless the new API is explicitly Conductor-specific and justified.

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

## 12. Service and contribution dependencies

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

## 13. Migration comments

When keeping legacy code during migration, annotate the boundary:

```ts
// TODO(conductor-architecture): Migration bridge.
// This command currently calls FilesPaneHost because IExplorerService is not wired yet.
// Move the behavior into IExplorerService and keep this handler as argument normalization only.
```

Do not leave ambiguous generic TODOs such as:

```ts
// TODO: clean up later
```
