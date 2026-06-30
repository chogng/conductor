---
description: Coding guidelines for workbench code - ownership, root-cause fixes, imports, service APIs, shared values, and NLS.
applyTo: 'src/cs/**'
---
# Coding Guidelines

These are self-contained baseline coding rules for workbench code. Keep rules
general, examples small, and domain-specific ownership maps out of this file.

## Core Rules

- Put behavior on the state owner.
- Keep registration, invocation, and subscription separate.
- Keep model state, view state, and persistence state separate.
- Keep runtime folders honest: `common`, `browser`, `electron-browser`, `electron-main`, `node`.
- Make ownership visible through names, entry points, mutation points, and events.
- Name and justify product-specific additions.
- Do not solve ownership problems with fallback or compatibility layers.
- When replacing an interface, migrate call sites directly.

## Before Editing

Code from the owner boundary, not the symptom file.

- Identify the owner before editing behavior.
- Read the owner implementation before changing callers.
- Search direct call sites before changing public APIs, events, command ids, action ids, or exported types.
- Read nearby tests before changing behavior or adding tests.

## Readable Shape

Good code exposes the chain:

```txt
entry point -> owner API -> owner mutation -> fact event -> subscriber reread
```

Use:

```txt
commandHandler -> ownerService.update(target, update);
ownerService.onDidChangeState.fire(event);
consumer rereads ownerService.getState();
```

Avoid:

```ts
view.callsOtherViewRefresh();
eventNamedOnShouldRefreshView.fire();
helperMutatesTwoOwners();
```

If code feels messy, fix the ownership shape before local cleanup. Do not hide mixed responsibilities behind helpers, renamed files, or formatting-only structure.

## Root-Cause Fixes

Bug fixes start at the behavior owner, not the visible symptom.

Trace:

```txt
symptom -> UI/command entry -> owner service/model/widget -> incorrect owner behavior
```

- Inspect shared owners first when the chain crosses hover, context menus,
  layout, commands, storage, filesystem, persistence, or other shared
  infrastructure.
- Regression tests should exercise the owner contract or original shared path.

## Commands And Actions

Pick the smallest command surface that matches the use:

| Need | Prefer |
| --- | --- |
| callable operation with no UI placement | `CommandsRegistry.registerCommand(...)` |
| menu, toolbar, keybinding, or Command Palette metadata | `registerAction2(...)` |
| live label, tooltip, enabled, or checked state | runtime `Action` / `IAction` |
| local DOM-only gesture | callback |

Handlers normalize arguments and delegate to owner APIs.

```ts
// Good
function handler(accessor, rawTarget) {
	const target = normalizeTarget(rawTarget);
	accessor.get(IOwnerService).open(target);
}

// Bad
function handler(accessor) {
	accessor.get(IOwnerService)._state.value = next;
}
```

## Service APIs

Keep API shape aligned with the owner boundary.

- If a call operates on an owner-owned runtime model object, pass that model object instead of flattening its fields.
- Use direct value fields/records at external boundaries such as commands, events, persistence, cross-service requests, and URI identity.
- Treat repeated long parameter groups as a missing-owner smell. Fix the owner API/model first; do not hide it with wrappers, aliases, facades, adapters, re-exports, or `*Target` bags.
- Do not widen a method signature for downstream convenience. Fix the owner boundary or split the responsibility.
- When changing an interface, update call sites to the new interface. Do not keep aliases, re-exports, wrappers, overloads, or compatibility signatures.
- Use names that state the real owner and responsibility. Do not add a new service just to name a workflow.
- Name public behavior APIs with verbs or verb phrases. Use `setX` only when an owner/model directly replaces its own state.

Example:

```ts
// Good: behavior APIs use verbs and keep owner-owned runtime objects intact.
ownerService.select(resource, options);
ownerService.rename(item, name);

// Good: value boundary, no runtime item crosses services.
operationService.apply(resource, subId, options);

// Good: model-local state replacement.
ownerModel.setSelection(selection);

// Bad: public behavior shaped like a state setter.
ownerService.setSelection(selection);

// Bad: owner-owned item state flattened for convenience.
ownerService.rename(resource, subId, name, source, mode);

// Bad: workflow name without ownership.
ownerImportService.importItem(item);
```

Use concrete field types when the contract is concrete:

```ts
// Good
readonly resource: URI;

// Bad
readonly resource: SomeTarget["resource"];
```

Keep dependency direction one-way:

```txt
platform -> base
workbench/services -> platform + service interfaces + shared snapshots
workbench/contrib -> service interfaces
view -> props, commands, owner service APIs
```

Avoid `service -> view`, `service -> CommandsRegistry`, `persistence -> UI
state`, `preparation workflow -> unrelated domain`, `domain renderer -> another
domain DOM`, and `view shell -> raw parsing`.

## Constructors And Lifecycle

Use constructors only to establish object lifetime:

- inject services;
- capture immutable lifetime options;
- initialize owned fields and context keys;
- register disposables, subscriptions, providers, and lightweight wiring.

Do not start workflows, parse large inputs, execute commands, fire externally visible changes, or mutate another owner from a constructor.

```ts
// Good
constructor(@IThingService private readonly thingService: IThingService) {
	this._register(this.thingService.onDidChangeThing(() => this.update()));
}

// Bad
constructor(@ICommandService commandService: ICommandService) {
	commandService.executeCommand("thing.run");
}
```

Do not add classes for pure data. Use interfaces, types, or plain objects unless the object owns lifecycle, invariants, or disposables.

## Imports

- Use relative imports within the same capability/module.
- Keep nearby files consistent.
- Import DI service symbols once and reuse the same name for value/type positions.
- Use `type` imports for pure type-only symbols.
- Do not alias a service interface only to split type/value imports.

```ts
import { IThingService } from "../../thing/common/thing";
import type { ThingRecord } from "../../thing/common/thing";
```

## Shared Values

- Keep implementation details private to the owner.
- Export constants only when callers depend on them as API.
- Keep UI ids, labels, CSS hooks, aria relationships, and storage keys with the owner that renders or reads them.
- Do not add constants modules just to avoid deciding ownership.

When unsure, add an owner API instead of exporting shared mutable knowledge.

## DOM And CSS Ownership

The component that creates a DOM node owns that node's classes and state.

- Renderers/widgets declare classes for DOM they create.
- Behavior owners toggle state classes.
- Feature roots provide CSS scope and layout context.
- Base/platform primitives must not know feature-specific classes.
- Do not add wrapper elements, alias classes, or compatibility DOM hooks to preserve old selectors.

```ts
// Good
const row = append(container, $(".settings-row"));
row.classList.toggle("is-expanded", expanded);

// Bad
inputBox.element.classList.add("settings-row");
```

```css
.settings-view .settings-row.is-expanded {
	min-height: 48px;
}
```

Cross-module behavior should use APIs, events, options, services, or explicit owner-provided elements, not another feature's private DOM.

## Components

Prefer names that state the role:

```txt
Service, Controller, Store, Model, Provider, Reader, Adapter, Planner, Cache, Registry
```

Use `Manager` only when none of those names is accurate.

## Migration Comments

When explicitly allowed to keep temporary migration code, state the boundary and
deletion condition.

```ts
// TODO(migration): Migration bridge.
// Boundary: this handler still calls the view until IOwnerService owns the action.
// Delete when the action is an IOwnerService API and this handler only normalizes arguments.
```

Avoid generic comments like `// TODO: clean up later`.

## NLS Keys

Keys describe stable product ownership and user-facing meaning:

```txt
domain.feature.message
```

```ts
// Good
localize("domain.feature.failedToLoad", "Failed to load {count} item(s).");
localize("domain.item.delete", "Delete");

// Bad
localize("failedToLoad", "Failed to load {count} item(s).");
localize("helper.failedToLoad", "Failed to load {count} item(s).");
```

Use keys that name the product domain, not the helper file or implementation path.
