---
description: Coding guidelines for Conductor workbench code - coding entry point for architecture, commands, records, service components, files boundaries, root-cause fixes, imports, shared values, and NLS.
applyTo: 'src/cs/**'
---
# Coding Guidelines

Use this file as the short coding entry point. It intentionally points to the
canonical instruction files instead of repeating their full rules.

Before editing code, read:

1. `architecture.instructions.md` for ownership, layers, events, selection,
   registration/invocation/subscription, and domain flows.
2. The matching module instruction file for the path you are editing.
3. `commands.instructions.md` when adding or changing command IDs, handlers,
   actions, menus, keybindings, controllers, or contribution wiring.
4. `records.instructions.md` when adding or changing canonical records,
   service state, view models, command targets, or field names.
5. `service-components.instructions.md` when introducing a service helper,
   controller, store, model, provider, adapter, planner, reader, registry, or
   cache.

## Core coding rules

- Keep behavior on the state owner. Views, actions, and commands translate user
  intent and call owner APIs; they do not mutate another owner's internals.
- Keep registration, invocation, and subscription separate. Registration files
  wire capabilities; command/action/controller code invokes owner APIs; owners
  publish `onDidChangeXxx`; listeners reread current public state.
- Keep model state and view state separate. Canonical analysis facts belong in
  Session; panel selection, focus, filters, draft forms, popovers, layout, and
  caches belong to the owning service or view.
- Keep runtime folders honest. `common` defines contracts and pure helpers;
  `browser` may use DOM/browser APIs; `electron-browser` may use renderer-side
  desktop bridges; `electron-main` is main process only.
- Prefer upstream VS Code shape when a responsibility has a counterpart under
  `C:\Users\lanxi\Desktop\vscode`. Conductor-specific additions must be named
  and justified as Conductor-specific.

## Root-cause fix discipline

Bug fixes start from the behavior owner, not the visible symptom.

Before editing code for a bug, identify this chain:

```txt
user symptom
  -> UI/event entry point
  -> command/action/controller/widget path
  -> service/component/primitive that owns the state or lifecycle
  -> incorrect owner behavior
```

If the chain crosses shared infrastructure such as hover, context menus,
ActionBar, dropdowns, view containers, layout, commands, storage, file service,
or session events, inspect that shared owner first. Do not patch an individual
view, CSS rule, button, or caller until you have proven the local surface owns
the behavior.

When the owner has a VS Code upstream counterpart, inspect upstream before
editing. Preserve upstream semantics and API shape unless Conductor has an
explicit product reason to diverge. If diverging, state the reason in the
implementation notes or final response.

Do not call the work complete until the regression test exercises the owner
contract or the original shared path. A local symptom test is acceptable only
when the local component is the owner.

## Commands and actions

Use `commands.instructions.md` for the full command/action rules. Quick checks:

| Need | Prefer |
| --- | --- |
| Callable logical operation with no UI placement | `CommandsRegistry.registerCommand(...)` |
| Menu, toolbar, keybinding, Command Palette, `when`, category, or telemetry metadata | `registerAction2(...)` |
| Mutable UI object with live `label`, `tooltip`, `enabled`, or `checked` | runtime `Action` / `IAction` |
| Temporary DOM-only gesture with no reuse or domain effect | local callback |

Do not register `CommandsRegistry.registerCommand(...)` and `registerAction2(...)`
with the same id. `Action2` already registers a command.

Command Palette visibility comes from `MenuId.CommandPalette`; do not make quick
access scan bare `CommandsRegistry` entries to compensate for missing action/menu
registration.

Command and action IDs describe the owning operation, not the UI location that
happens to invoke it. Avoid IDs such as `titlebar.selectFile` for behavior
owned by Files/Explorer or workbench mode switching.

Command handlers should normalize arguments, resolve services/controllers
through `ServicesAccessor`, call an owner API, and return. They must not hold
long-lived state, mutate DOM, or mutate `SessionModel` directly.

## Files and Explorer naming

Use `files.instructions.md` for the full Files/Explorer boundary. Quick checks:

| Name | Meaning |
| --- | --- |
| `IFileService` | Platform filesystem capability: read, write, stat, watch, provider registration. |
| `files` module | Workbench Files capability/container area and source workflow surface. |
| `IExplorerService` | Explorer UI state: resources, selection, reveal, expansion, layout, context. |
| `ExplorerView` / `ExplorerViewer` | Files container UI rendering. |
| `fileImportExport.ts` | File transfer and source collection helpers. |
| `fileConverter.ts` | CSV/XLS/XLSX/clipboard/manual conversion to raw table facts. |

Do not introduce `IFileImportService` by default. Keep source collection in the
Explorer/files workflow, conversion in `workbench/services/files`, and
canonical commit in `ISessionService`.

## Service APIs and dependencies

Owner APIs act on pure target/value records:

```txt
ownerService.select(target, reveal?)
ownerService.reveal(target, options?)
ownerService.open(target, options?)
ownerService.update(target, update)
ownerModel.setSelection(selection)
```

Do not turn targets into behavior objects:

```txt
target.select()
cell.reveal()
row.open()
curve.toggle()
```

Allowed dependency direction:

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

## Service import style

Follow the upstream VS Code DI service symbol pattern. A service identifier
usually exports both a runtime decorator value and a TypeScript interface with
the same name:

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
as records, props, options, and helper interfaces.

## Shared values

Shared constants follow ownership and import-direction rules.

- Keep implementation details private to the file or module that owns the
  behavior.
- Export values from a service or common contract only when callers genuinely
  depend on that value as part of the API.
- Keep UI ids, labels, CSS hooks, and aria relationships with the UI surface or
  contribution that renders or registers them.
- Keep storage keys with the service or part that reads and writes the stored
  state, unless the key is intentionally part of a persistence contract.
- Do not add a separate constants module merely to avoid deciding ownership.

When a value seems needed across layers, first check whether callers should
consume an owner API instead of importing the value directly.

## Component naming

Use `service-components.instructions.md` for full helper naming rules. Quick
rule: avoid vague manager hierarchies. Prefer suffixes that state the role:

```txt
Service, Controller, Store, Model, Provider, Reader, Adapter, Planner, Cache, Registry
```

Only use `Manager` when none of those names is accurate.

## Migration comments

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

## NLS key naming

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
localize('files.import.failedToReadFiles', 'Failed to read {count} file(s).')
localize('files.item.delete', 'Delete')
localize('chart.views.search', 'Search')
localize('titlebar.mode.chart', 'Chart')
```

Avoid broad, ownerless keys:

```ts
localize('import.failedToReadFiles', 'Failed to read {count} file(s).')
```

Avoid implementation-shaped keys that would need to change when a class or file
is refactored:

```ts
localize('fileImportExport.failedToReadFiles', 'Failed to read {count} file(s).')
```

Use `files.import.*` for the Explorer data-file import/source-collection
workflow. Keep top-level `files.*` for Files/Explorer-wide labels and
`files.item.*` or `files.actions.*` for file item labels and command/action
descriptions.
