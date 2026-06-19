---
description: Conductor source code organization - layers, target environments, dependency injection, and folder conventions.
applyTo: src/cs/**
---
# Source Code Organization

Canonical reference: https://github.com/chogng/conductor/wiki/Source-Code-Organization

## Layers

`src/cs/` uses ordered layers. A layer may import only from layers below it:

1. `base` - utilities and UI primitives.
2. `platform` - service injection support and base platform services.
3. `workbench` - workbench services, views, panels, framework.
4. `code` - desktop app entry points.
5. `server` - server app entry points.

## Runtime Folders

| Folder | APIs |
| --- | --- |
| `common` | basic JavaScript only |
| `browser` | Web/DOM + `common` |
| `node` | Node + `common` |
| `electron-browser` | browser + limited Electron IPC |
| `electron-utility` | Electron utility process |
| `electron-main` | Electron main process |

## Workbench Shape

- `workbench/{common|browser|electron-browser}`: minimal workbench core.
- `workbench/api`: `vscode.d.ts` API provider.
- `workbench/services`: cross-feature/core services.
- `workbench/contrib`: feature contributions.

When a Conductor responsibility has an upstream VS Code counterpart, inspect
`/Users/lance/Desktop/vscode` before naming files, methods, classes, services,
or contribution entries. Prefer upstream shape; label Conductor-specific
additions explicitly.

## Contributions

- Lower layers and unrelated features must not depend on contrib internals.
- Each contribution has a `.contribution.ts` entry point.
- Contributions expose shared API from a contribution-owned contract file.
- Cross-contribution use goes through public contracts, not internals.

Workbench entry points may import contribution registration modules and public
contracts to wire the workbench. That does not move contribution ownership into
`workbench/services`.

Examples:

- `IExplorerService` belongs to `workbench/contrib/files`, even if an entry point imports its registration.
- `platform/quickinput` owns quick input primitives; `workbench/contrib/quickaccess` owns quick access provider registration.

## Entry Points

Only code referenced from entry point files is loaded:

- `workbench.common.main.ts`: shared dependencies.
- `workbench.browser.main.ts`: browser renderer registrations shared by web/desktop.
- `workbench.desktop.main.ts`: desktop-only.
- `workbench.web.main.ts`: web-only.

For large entry/boundary files such as `preload.ts`, `workbench.*.main.ts`, and
`electron-main/app.ts`, use `//#region` sections for architectural grouping.

Entry point regions should match ownership:

- `workbench services`;
- `workbench service contributions`;
- `workbench contrib services`;
- `workbench browser contributions`;
- `workbench contributions`.

Do not move an implementation into `workbench/services` only because it uses DI.
Location follows ownership.

## Dependency Injection

Consume services with constructor injection:

```ts
class MyComponent {
  constructor(@IMyService private readonly myService: IMyService) {}
}
```

Register implementations with `registerSingleton(...)`.

Import DI service symbols once, using the same name for runtime decorator and
TypeScript interface. Use `type` imports only for symbols that are purely
type-only.
