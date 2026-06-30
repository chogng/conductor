---
description: Coding guidelines for Conductor workbench code - ownership, root-cause fixes, imports, service APIs, shared values, and NLS.
applyTo: 'src/cs/**'
---
# Coding Guidelines

Use this file as the short coding entry point. Before editing code, read:

1. `architecture.instructions.md` for ownership, layers, events, selection, and domain flow.
2. The matching module instruction file for the path you are editing.
3. `commands.instructions.md` when changing command/action ids, handlers, menus, keybindings, controllers, or contribution wiring.
4. `settings.instructions.md` when changing settings persistence, settings UI, or settings-driven side effects.
5. `service-components.instructions.md` when introducing service helpers, controllers, stores, models, providers, adapters, planners, readers, registries, or caches.

## Core Rules

- Keep behavior on the state owner.
- Keep registration, invocation, and subscription separate.
- Keep model state and view state separate.
- Keep runtime folders honest: `common`, `browser`, `electron-browser`, `electron-main`, `node`.
- Prefer upstream VS Code shape when a responsibility has an upstream counterpart.
- Use constructors for DI and lifecycle wiring when a class owns runtime state.
- Make code readability come from visible ownership, entry points, and side effects.
- Conductor-specific additions must be named and justified as Conductor-specific.

## Readable Code Shape

Readable Conductor code should make the architecture visible. A reader should
be able to identify the entry point, state owner, mutation point, event facts,
and lifecycle owner without reconstructing hidden flow from helpers or naming
history.

Follow the upstream VS Code style in shape, not surface aesthetics:

- registration files wire contributions and services;
- commands, actions, and controllers normalize input and delegate;
- services and models mutate only their owned state;
- records, targets, candidates, and DTO-like values stay as data;
- subscriptions, context keys, providers, and disposables are tied to a clear
  lifecycle owner.

When code feels messy, fix the ownership shape before local cleanup. Do not
hide mixed responsibilities behind a helper, rename a file without moving the
responsibility, or add formatting-only structure while old and new owners still
share the same behavior.

Avoid files that mix unrelated roles such as schema definitions, candidate
building, evaluation, application planning, UI state, and compatibility bridges.
If migration forces a temporary mix, mark the bridge explicitly and keep the new
owner API clear.

## Root-Cause Fixes

Bug fixes start from the behavior owner, not the visible symptom.

Trace:

```txt
user symptom
  -> UI/event entry point
  -> command/action/controller/widget path
  -> service/component/primitive that owns the state or lifecycle
  -> incorrect owner behavior
```

If the chain crosses shared infrastructure such as hover, context menus,
ActionBar, dropdowns, view containers, layout, commands, storage, file service,
or session events, inspect the shared owner first.

When an upstream counterpart exists under `/Users/lance/Desktop/vscode`, inspect
it before editing. Preserve upstream semantics unless Conductor intentionally
diverges.

Regression tests should exercise the owner contract or original shared path.

## Commands And Actions

Quick choice:

| Need | Prefer |
| --- | --- |
| callable operation with no UI placement | `CommandsRegistry.registerCommand(...)` |
| menu/toolbar/keybinding/Command Palette/context metadata | `registerAction2(...)` |
| live mutable label/tooltip/enabled/checked | runtime `Action` / `IAction` |
| local temporary DOM gesture | callback |

Command ids describe the owner operation, not UI location. Handlers normalize
args, resolve services/controllers, call owner APIs, and return.

## Files And Explorer Names

| Name | Meaning |
| --- | --- |
| `IFileService` | platform filesystem capability |
| `files` module | Files capability/container and source workflow surface |
| `IExplorerService` | Explorer UI state: resources, selection, reveal, expansion, layout, context |
| `ISessionService` | imported data-file/raw-table ledger plus downstream analysis records |
| `ExplorerView` / `ExplorerViewer` | Files container UI rendering |
| `fileImportExport.ts` | file transfer and source collection helpers |
| `ITableFileService` / `TableFileEditorModel` | URI-backed table file open/cache/reload/save lifecycle |

Do not introduce `IFileImportService` by default. Source collection stays in
Explorer/files workflow; ordinary execution stays keyed by `{ resource, sheetId? }` through Slice;
ordinary Explorer file-to-table imports update Explorer-local rows and open
URI-backed table resources through `ITableService`.

## Service APIs

Owner APIs act on pure target/value records:

```txt
ownerService.select(target, reveal?)
ownerService.reveal(target, options?)
ownerService.open(target, options?)
ownerService.update(target, update)
ownerModel.setSelection(selection)
```

Do not turn targets into behavior objects.

Write concrete field types directly when the type is already part of the local
contract. For example, use `readonly resource: URI` instead of
`readonly resource: SomeTarget["resource"]`. Use indexed access types only when
the field intentionally follows another type's changing property shape, not as
a shortcut for a known concrete type.

Dependency direction:

```txt
platform -> base
workbench/services -> platform + service interfaces + session snapshots
workbench/contrib -> service interfaces
view -> props, commands, owner service APIs
```

Avoid `service -> view`, `service -> CommandsRegistry`, `session -> UI state`,
`source preparation -> review/template/plot`, `plot -> chart DOM`, and
`chart -> raw table parsing`.

## Constructors And Lifecycle

Match the upstream VS Code constructor shape for classes that own a runtime
lifecycle: services, controllers, contributions, models, stores, providers,
adapters, widgets, and view parts.

Use constructors to:

- inject services through DI parameters;
- capture immutable options needed for the object's lifetime;
- initialize owned fields and context keys;
- register disposables, event subscriptions, providers, and lightweight
  contribution wiring through the object's lifecycle owner.

Keep constructors synchronous and lightweight. They establish invariants and
wiring; they do not run domain workflows, execute commands, perform async
loading, parse large inputs, fire owner events for externally visible changes,
or mutate state owned by another service. Put those behaviors behind explicit
owner APIs, lifecycle methods, or event callbacks.

Do not introduce a class or constructor for pure data. Shared records, command
targets, review candidates, table facts, and DTO-like values stay as interfaces,
types, or plain objects unless the object has a real lifecycle, invariant, or
owned disposable state.

## Imports

- Use relative imports within the same capability/module.
- Keep nearby files consistent.
- Import DI service symbols once and use the same name for value/type positions:

```ts
import { xxx } from "../../xxx/xxx";
```

Use `type` imports for pure type-only symbols. Do not alias a service interface
only to split type/value imports.

## Shared Values

- Keep implementation details private to the owning file/module.
- Export constants only when callers depend on them as API.
- Keep UI ids, labels, CSS hooks, and aria relationships with the rendering or registration owner.
- Keep storage keys with the service/part that reads and writes them.
- Do not add constants modules just to avoid deciding ownership.

When unsure, prefer an owner API over exporting shared mutable knowledge.

## DOM And CSS Ownership

Follow the upstream VS Code class ownership shape: the component, renderer, or
widget that creates a DOM node owns that node's slot and state classes.

- Feature renderers/widgets declare classes for DOM they create.
- The behavior owner toggles state classes.
- Feature roots provide CSS scope and layout context.
- Base/platform primitives must not know feature-specific class names.
- Do not add wrapper elements, alias classes, or compatibility DOM hooks just
  to preserve old selectors. Migrate the affected CSS and call sites directly.

Prefer:

```ts
const row = append(container, $('.settings-row'));
row.classList.toggle('is-expanded', expanded);
```

```css
.settings-view .settings-row.is-expanded {
  min-height: 48px;
}
```

Avoid:

```ts
inputBox.element.classList.add('settings-row');
```

Internal DOM classes are private styling contracts for the owning module.
Cross-module behavior should use TypeScript APIs, events, options, services, or
explicit owner-provided elements instead of querying another feature's DOM.

## Components

Avoid vague manager hierarchies. Prefer names that state the role:

```txt
Service, Controller, Store, Model, Provider, Reader, Adapter, Planner, Cache, Registry
```

Use `Manager` only when none of those names is accurate.

## Migration Comments

When keeping retired compatibility code during migration, annotate the boundary:

```ts
// TODO(conductor-architecture): Migration bridge.
// This command currently calls ExplorerViewPane because IExplorerService is not wired yet.
// Move the behavior into IExplorerService and keep this handler as argument normalization only.
```

Avoid generic TODOs like `// TODO: clean up later`.

## NLS Keys

Keys describe stable product ownership and user-facing meaning:

```txt
domain.feature.message
```

Prefer:

```ts
localize("files.import.failedToReadFiles", "Failed to read {count} file(s).")
localize("files.item.delete", "Delete")
localize("chart.views.search", "Search")
localize("titlebar.mode.chart", "Chart")
```

Avoid ownerless or implementation-shaped keys:

```ts
localize("import.failedToReadFiles", "Failed to read {count} file(s).")
localize("fileImportExport.failedToReadFiles", "Failed to read {count} file(s).")
```

Use `files.import.*` for Explorer data-file import/source collection,
`files.item.*` or `files.actions.*` for item/action labels, and top-level
`files.*` for Files/Explorer-wide labels.
