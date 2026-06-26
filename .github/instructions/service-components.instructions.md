---
description: Service component naming rules and manager-boundary guidance. Use when introducing a service helper, controller, store, model, provider, adapter, planner, reader, registry, or cache.
applyTo: 'src/cs/workbench/services/**,src/cs/workbench/contrib/**'
---
# Service Components

Avoid vague manager hierarchies. Prefer names that state whether the component
owns state, coordinates a workflow, builds a projection, reads data, adapts
payloads, or caches output.

## Naming

| Suffix | Use when | Must not do |
| --- | --- | --- |
| `Service` | injectable owner of domain/service state | depend on views or DOM |
| `Controller` | transient user workflow coordination | own canonical records or replace service APIs |
| `Model` | data shape or pure projection | call services or mutate Session |
| `Store` | local service/view-service state with events | store Session-owned canonical records |
| `Registry` | id-to-handler/provider/descriptor map | orchestrate workflows |
| `Provider` | external data/capability behind an interface | interpret measurement semantics |
| `Reader` | reads from existing source | own import state |
| `Adapter` | converts one representation to another | make hidden domain decisions |
| `Planner` | creates execution/export/apply plan from immutable input | start workers or mutate Session |
| `Cache` | caches reproducible output | become source of truth |

Use `Manager` only when none of these names is accurate.

## Service File Pattern

```txt
common/<domain>.ts          service interface, events, input/target types
common/<domain>Records.ts   canonical records when needed
common/<domain>State.ts     service-local state
common/<domain>Model.ts     derived render/read models
browser/<domain>Service.ts  injectable owner
browser/<domain>Controller.ts optional workflow coordinator
browser/<domain>Store.ts    optional local mutable helper
browser/<domain>*.contribution.ts registration/lifecycle only
```

## Helper Rules

A helper is allowed when owner and lifetime are explicit:

- model helpers define records/projections;
- source workflow helpers coordinate dialogs/drop/folder collection and return prepared results;
- readers read existing storage;
- adapters normalize payloads;
- planners produce deterministic plans;
- caches store reproducible output keyed by signatures.

Target helpers may normalize, compare, serialize, or label values. They must
not call services, mutate owner state, register listeners, or own lifecycle.

## Forbidden Shape

Avoid:

```txt
ExplorerManager -> ImportManager -> SelectionManager
ChartManager -> PlotManager -> AxisManager
SessionManager -> FileManager -> RecordManager
```

Prefer explicit ownership:

```txt
ExplorerService owns ExplorerState.
fileActions.ts / fileImportExport.ts coordinate add-data workflows.
fileImportExport.ts prepares resource-backed Explorer source rows.
SessionService commits canonical records.
PlotService owns plot state and render models.
ChartService owns chart shell state only.
```

If a private helper needs public API, events, disposal, direct service access,
and tests, make it an explicit service, controller, store, or model instead of
a nested manager.
