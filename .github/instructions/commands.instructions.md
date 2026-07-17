---
description: Command entry and service dispatch architecture - command IDs, handlers, actions, controllers, contribution registration, and target normalization.
applyTo: 'src/cs/workbench/**/{*Commands.ts,*Actions.ts,*.contribution.ts,*Controller.ts},src/cs/platform/commands/**'
---
# Commands and Dispatch

Commands are public entry points for user intent. Services own state and domain
work. Views render state.

Use this file when adding command ids, actions, menu items, toolbar buttons,
context-menu entries, keybindings, or workflow controllers.

## ID Naming

- Command/action ids describe the owning operation, not the UI location.
- Reuse the same owner command from titlebar, toolbar, menu, context menu, and keybinding entries.
- Use UI-location names only for DOM ids, CSS hooks, test selectors, or local runtime action ids.
- Workbench mode vocabulary is `table` and `chart`; avoid retired/generic labels such as `analysis`.

Avoid ids such as `titlebar.selectFile` when the owner is Files/Explorer or
workbench mode switching.

## Choose The Entry Type

| Need | Prefer |
| --- | --- |
| Callable logical operation with no UI placement | `CommandsRegistry.registerCommand(...)` |
| Menu, toolbar, keybinding, Command Palette, `when`, category, telemetry metadata | `registerAction2(...)` |
| Mutable UI object with live `label`, `tooltip`, `enabled`, or `checked` | runtime `Action` / `IAction` |
| Temporary local DOM gesture with no reuse or domain effect | local callback |

`Action2` registers a command with the same id. Do not also call
`CommandsRegistry.registerCommand(...)` with that id.

Because an `Action2` id is also a command id, place and reuse that id at the
operation owner boundary. A button, titlebar entry, menu item, or another view
must not import a feature's action implementation just to get the id. If the
operation is owned by workbench navigation, put the id with workbench layout
commands; if it is owned by a feature/domain, put the id with that feature's
command contract and let the `Action2` use it.

Export each reusable command id as its own named constant:

```ts
export const OPEN_THING_COMMAND_ID = "thing.open";
```

Do not hide workbench command ids in `ThingCommandId`/`ThingCommandIds` object
bags, `Action2` static fields, or constants named `*_ACTION_ID`. Keep
`*_ACTION_ID` only for runtime `IAction` values that are not registered as
commands. Local runtime action ids stay private to the rendering component.

Command Palette visibility comes from `MenuId.CommandPalette` menu actions.
Use `registerAction2({ f1: true, ... })` or explicit menu registration. Do not
make quick access scan bare `CommandsRegistry` to compensate for missing action
registration.

## Command Flow

```txt
button/menu/keybinding/context menu
  -> action
  -> command id
  -> handler
  -> optional controller
  -> owner service method
  -> session commit, service state update, or side effect
  -> service/session event
  -> view rerender
```

Small local DOM interactions may stay in the view. Cross-view, reusable, or
domain behavior must be a command or service API.

## File Responsibilities

| File | Responsibility | Must not do |
| --- | --- | --- |
| `platform/commands/common/commands.ts` | platform command service/registry | import workbench services/views |
| `contrib/<feature>/browser/<feature>Commands.ts` | command ids/handlers; validate args and delegate | own state, mutate DOM, mutate Session |
| `contrib/<feature>/browser/<feature>Actions.ts` | `Action2` classes and runtime action helpers | duplicate business logic |
| `contrib/<feature>/browser/<feature>.contribution.ts` | register commands/actions/menus/keybindings/views | become a service/controller |
| `contrib/<feature>/browser/<feature>Controller.ts` | optional multi-step workflow coordinator | store canonical records |
| `services/<domain>/common/<domain>.ts` | service contract and target/input types | register UI commands |
| `services/<domain>/browser/<domain>Service.ts` | state owner and domain implementation | depend on views/commands |

## Handler Rules

A handler should usually:

1. Normalize and validate arguments.
2. Resolve services/controllers through `ServicesAccessor`.
3. Normalize a `CommandTarget` if needed.
4. Call the owner service/controller.
5. Return a value or `undefined`.

Targets are pure records. They identify what the command acts on; they do not
perform the action.

Prefer:

```ts
tableService.select(target, "force");
explorerService.select(resource, "force");
ownerService.update(target, update);
```

Avoid:

```ts
target.select();
row.open();
curve.toggle();
```

If a command palette invocation has no target, ask the owning service for its
own current selection/focus/query. Do not ask a view for DOM state and do not
store active command targets in Session.

## Target Shape

Use explicit target records when a command acts on a domain object:

| Kind | Core fields |
| --- | --- |
| `explorerResource` | `resource`, optional `sheetId` |
| `file` | `fileId` |
| `rawTable` | `fileId`, `rawTableId` |
| `tableResourceRange` | `resource`, optional `sheetId`, `range` |
| `measurementBlock` | `fileId`, `blockId` |
| `series` | `fileId`, `seriesId` |
| `curve` | `fileId`, `curveKey` |
| `metric` | `fileId`, `metricKey` |

Do not pass DOM nodes, view instances, or partial ad-hoc objects through
command APIs.

Explorer row commands use the direct Conductor row identity
`{ resource: URI, sheetId?: string | null }`. Command handlers may use
`IExplorerService` current selection when a command is explicitly invoked without
a target, but Explorer row-level commands must not accept a URI-only target when
the operation needs the exact visible row.

## Dispatch Owners

| Command family | Owner |
| --- | --- |
| workbench main mode/container navigation | `IViewsService.openViewContainer(...)` / view-container navigation APIs |
| workbench part visibility/sidebar/auxiliary bar/window chrome | layout service or native host; titlebar only renders buttons |
| Explorer add/remove/select/toggle layout | `IExplorerService`, or `ExplorerViewPane` reached through `IViewsService.openView(...)` for view-local workflows |
| low-level filesystem operations | `IFileService`, usually not user-facing workbench commands |
| Explorer source import/open | Explorer source workflow + Explorer-local rows + `ITableService.open({ resource })` |
| table reveal/copy/select | `ITableService` |
| template save/delete/import/apply | `IUserTemplateService` for library management; Slice command handlers for application |
| plot type/unit/scale/visibility | `IPlotService` |
| chart legend/inspector/focus | `IChartService` or explicit chart view workflow service |
| thumbnail cache/layout | `IThumbnailService` for cache, `IExplorerService` for layout |
| search query/open result | `ISearchService`, then target owner for reveal |
| export | `IExportService` |
| parameters pane navigation | `IViewsService` for the chart container, layout service for the active auxiliary view, and `IParametersService` view state |

## Controllers

Use a controller only when a workflow is more than one service call: dialog,
progress, notifications, batching, worker lifecycle, or user-facing error
translation.

Controllers must not own canonical records, parse raw tables, detect
measurement blocks, store chart/table/search state long term, or replace a
service API.

## Do Not

- Do not edit DOM directly from handlers.
- Do not duplicate command logic in actions.
- Do not mutate `SessionModel` from views/actions/handlers.
- Do not register broad feature commands in `workbench.ts` unless truly global.
- Do not make `SessionService` dispatch user workflows.
- Do not make Chart own Plot commands.
- Do not inline Explorer source preparation or table-open handoff in command handlers; delegate to Explorer source workflow.
