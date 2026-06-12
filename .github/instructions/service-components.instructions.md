---
description: Service component naming rules and manager-boundary guidance. Use when introducing a service helper, controller, store, model, provider, adapter, planner, reader, registry, or cache.
applyTo: 'src/cs/workbench/services/**,src/cs/workbench/contrib/**'
---
# Service Components and Manager Boundaries

Avoid vague manager hierarchies. A class named `Manager` usually hides the real ownership question. Prefer names that state whether the component owns state, coordinates a workflow, builds a projection, reads data, adapts payloads, or caches output.

## Component naming and nesting rules

Do not create vague nested managers such as `ExplorerManager` containing `ImportManager`, `SelectionManager`, and `ViewManager`. Use names that expose ownership and lifetime.

| Name suffix | Use when | Owns state? | Example | Must not do |
| --- | --- | --- | --- | --- |
| `Service` | The component is injectable and owns domain or service state. | Yes, when state belongs to the domain. | `ExplorerService`, `PlotService` | Depend on views or DOM. |
| `Controller` | The component coordinates a user workflow, command, dialog, notification, or worker operation. | Only transient workflow state. | `TemplateApplyController` | Become the canonical owner of records; create upstream-looking controllers when an upstream file shape already exists. |
| `Model` | The component is a pure data shape or projection builder. | No long-lived mutable state. | `explorerModel.ts`, `PlotRenderModel` | Call services or mutate session. |
| `Store` | The component owns local service state with events. | Yes, but only local service/view-service state. | `PlotSettingsStore` | Store canonical records that belong in Session; extract Explorer selection state before `ExplorerService` proves insufficient. |
| `Registry` | The component maps ids to handlers/providers/descriptors. | Registry entries only. | `PlotRendererRegistry` | Orchestrate workflows. |
| `Provider` | The component supplies external data/capability behind an interface. | Usually no canonical state. | `RawTableRowsProvider`, `FileSystemProvider` | Interpret measurement semantics. |
| `Reader` | The component reads data from an existing source. | Cache only if explicitly stated. | `RawTableRowsReader` | Own import state. |
| `Adapter` | The component converts one representation to another. | No. | `AssessmentWasmAdapter`, `PlotModelAdapter` | Make domain decisions not encoded in input. |
| `Planner` | The component creates an execution/export/apply plan from immutable input. | No. | `TemplateApplyPlanner`, `ExportPlanBuilder` | Start workers or mutate session. |
| `Cache` | The component caches reproducible output. | Cache only. | `ThumbnailCache`, `PlotRenderCache` | Become the source of truth. |

If a component seems to need sub-managers, split by responsibility instead of nesting manager classes. Prefer this shape:

```txt
ExplorerService
  owns ExplorerState and emits Explorer events

fileActions.ts / fileActions.contribution.ts
  register and implement Explorer commands/actions

common/explorerModel.ts
  defines Explorer resource/item model and tree helpers
```

Do not use this shape:

```txt
ExplorerManager
  ImportManager
  SelectionManager
  FolderManager
  ThumbnailManager
```


## Service file pattern

Use this pattern for each service domain:

```txt
common/<domain>.ts
  service interface, service events, command-facing input/target types

common/<domain>Records.ts
  canonical records owned by Session or produced by this service

common/<domain>State.ts
  service-local state, never Session canonical data unless explicitly stated

common/<domain>Model.ts
  derived render/read models

browser/<domain>Service.ts
  injectable owner of service state and implementation

browser/<domain>Controller.ts
  optional workflow coordinator called by commands

browser/<domain>Store.ts
  optional local mutable state helper used by the service

browser/<domain>*.contribution.ts
  registration and lifecycle wiring only
```

## When a helper is allowed

A helper is allowed when its owner and lifetime are explicit:

| Helper | Allowed responsibility |
| --- | --- |
| `common/explorerModel.ts` | Define Explorer resource/item model and tree helpers. |
| `fileActions.ts` / `fileImportExport.ts` workflow helpers | Open dialogs, collect dropped files, call conversion helpers, commit session. |
| `RawTableRowsReader` | Read rows from inline or normalized CSV storage. |
| `AssessmentWasmAdapter` | Convert WASM input/output only. |
| `TemplateApplyPlanner` | Create a deterministic apply plan from template config and assessment blocks. |
| `PlotRenderModelBuilder` | Build plot render model from session curves and plot state. |
| `ThumbnailCache` | Cache thumbnail render output keyed by plot model signature. |
| `ExportPlanBuilder` | Build export plan from plot/session/export state. |

## Owner APIs and target helpers

For all `workbench/services/**` and `workbench/contrib/**` code, target/helper
objects must not hide service behavior. A target helper may normalize,
compare, serialize, or label a value. It must not call services, mutate owner
state, register listeners, or own lifecycle.

Prefer:

```txt
FeatureService owns state and exposes select/reveal/update/toggle methods.
FeatureTarget is a pure record.
featureTarget.ts normalizes or compares FeatureTarget values.
FeatureView creates targets and calls FeatureService.
```

Avoid:

```txt
FeatureTarget.select()
FeatureRow.toggle()
FeatureCell.reveal()
FeatureSelectionManager owns state beside FeatureService
```

If a helper needs public methods, events, disposal, and direct access to
services, it is not a target helper. Make the ownership explicit as a service,
controller, store, or model, and keep the public API on the owner boundary.

## Forbidden patterns

Do not introduce these patterns:

```txt
ExplorerManager -> ImportManager -> FileManager
ChartManager -> PlotManager -> AxisManager
SessionManager -> FileManager -> RecordManager
```

Use explicit ownership instead:

```txt
ExplorerService owns ExplorerState.
fileActions.ts / fileImportExport.ts coordinate Explorer add-data workflows.
fileConverter.ts converts files into raw table records.
SessionService commits canonical imported records.
PlotService owns plot state and render models.
ChartService owns chart shell state only.
```

## Rule for nested objects

A service may contain private helpers, but the public architecture must not require understanding a tree of managers. If a helper needs its own public API, lifecycle, events, and tests, it is probably either a separate service, a controller, or a store.
