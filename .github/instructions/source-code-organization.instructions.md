---
description: Conductor source code organization — layers, target environments, dependency injection, and folder structure conventions. Reference when adding new modules, services, or contributions.
applyTo: src/cs/**
---

# Source Code Organization

Canonical reference: https://github.com/chogng/conductor/wiki/Source-Code-Organization

## Layers

The `src/cs/` core is partitioned into ordered layers — each may only import from layers below it:

1. **`base`** — General utilities and UI building blocks (no service dependencies)
2. **`platform`** — Service injection support and base services shared across layers
3. **`workbench`** — Full VS Code workbench, panels, views, and framework
4. **`code`** — Desktop app entry point (Electron main, shared process, CLI)
5. **`server`** — Server app entry point for remote development

## Target Environments

Within each layer, code is organized by runtime environment:

| Folder | APIs Available | May Use |
|--------|---------------|---------|
| `common` | Basic JavaScript only | — |
| `browser` | Web/DOM APIs | `common` |
| `node` | Node.js APIs | `common` |
| `electron-browser` | Browser + limited Electron IPC | `common`, `browser` |
| `electron-utility` | Electron utility process | `common`, `node` |
| `electron-main` | Electron main process | `common`, `node`, `electron-utility` |

## Workbench Organization

- `cs/workbench/{common|browser|electron-browser}` — minimal workbench core
- `cs/workbench/api` — `vscode.d.ts` API provider
- `cs/workbench/services` — core services (not contrib-specific)
- `cs/workbench/contrib` — feature contributions

## Upstream Shape Rule

The upstream architecture at `C:\Users\lanxi\Desktop\vscode` is the default source of truth when a Conductor responsibility has a VS Code counterpart.

Before documenting or introducing a target file, service method, class, or contribution entry:

- verify the upstream path;
- verify exported symbols and public method names;
- prefer the upstream API shape when the responsibility exists upstream;
- label Conductor-specific additions explicitly instead of giving them upstream-looking names.

Do not invent service methods, filenames, controllers, or model classes from a conceptual responsibility when upstream already has a concrete shape. For example, if upstream Explorer exposes `IExplorerService.select(...)`, do not document a conceptual `setSelection(...)` replacement unless Conductor intentionally adds a new API and explains why.

### Contribution Rules

- Lower layers and unrelated features must not depend on `contrib/` internals.
- Each contribution has a single `.contribution.ts` entry point
- Contributions expose shared API from the contribution-owned contract file
- Cross-contribution dependencies use that common API — never reach into internals

Workbench entry points and composition code are allowed to import contribution
registration modules and public contribution contracts when they are wiring the
workbench together. This does not move the contribution's ownership into
`workbench/services`.

Example: `IExplorerService` and `ExplorerService` belong to
`workbench/contrib/files` because Explorer is Files feature UI state. An entry
point may import `contrib/files/browser/explorerService` to run its
`registerSingleton(...)`, but that import should be grouped as a contrib-owned
service registration, not under the core `workbench/services` section.

## Entry Points

Only code referenced from entry point files is loaded:

`workbench.browser.main.ts` contains browser renderer registrations shared by
both web and desktop entry points.

- `workbench.common.main.ts` — shared dependencies
- `workbench.desktop.main.ts` — desktop-only
- `workbench.web.main.ts` — web-only

### Large Entry Files

For large entry-point or boundary files such as `preload.ts`, `workbench.*.main.ts`, and `electron-main/app.ts`, prefer `//#region ...` / `//#endregion` sections to group related responsibilities.

Use regions for architectural grouping, not to hide small unrelated helpers. Keep actual Electron preload entry files obvious: use `preload.ts` for the main window and add `preload-aux.ts` only when an auxiliary window preload is actually registered.

Keep entry-point regions aligned with ownership:

- `workbench services` imports implementations from `workbench/services/**`.
- `workbench service contributions` imports lifecycle registration files from `workbench/services/**/*.contribution.ts`.
- `workbench contrib services` imports DI service implementations owned by a contribution, such as `contrib/files/browser/explorerService`.
- `workbench browser contributions` imports core workbench browser action and contribution registration files.
- `workbench contributions` imports `.contribution.ts` registration files, actions, commands, and feature contribution entry points.

Do not move a service implementation into `workbench/services` only because it
uses DI. Location follows ownership, while the entry point region explains why
the import exists.

## Dependency Injection

Services are consumed via constructor injection with decorator identifiers:

```typescript
class MyComponent {
  constructor(@IMyService private readonly myService: IMyService) { }
}
```

Services are provided via `registerSingleton(IMyService, MyServiceImpl, InstantiationType.Delayed)`.
