---
description: Rust execution branch guidelines for Conductor desktop - runtime route, domain boundaries, payload shape, parity, fallback, and lifecycle.
applyTo: 'src/cs/workbench/services/{files,table,template,plot,parameters,export,origin,search}/**,src/cs/platform/rust/**,src/cs/code/electron-main/{rustHostChannels.ts,rustHostService.ts,app.ts},src/cs/base/parts/sandbox/electron-browser/preload.ts,cli/**,extensions/**'
---
# Rust Execution Branch

Rust is a desktop data-plane execution branch. It is not a separate workbench
domain, command layer, view layer, or second product session.

## Core Flow

```txt
Command / Action / View
  -> common domain service contract
  -> browser or electron-browser implementation
  -> desktop implementation may call conductor-rs through IPC/preload
  -> service validates and normalizes result
  -> Session commit or service event
  -> views consume normal domain models
```

TypeScript remains the control plane: commands, service contracts,
orchestration, Session commits, stale-result checks, fallback policy, view
state, DOM, and user-facing notifications.

Rust may own heavy execution and runtime caches for table reads, table-model production, explicit slice/template
execution, metric/Rc calculation, plot-frame
construction, downsampling, search, and export artifact generation.

## Runtime Route

Desktop runs Rust as a bundled helper binary:

```txt
Conductor Studio.app resources/bin/conductor-rs
Electron main spawn(conductor-rs, ["--stdio-worker"])
```

Resolution order:

```txt
CONDUCTOR_RS_CLI_PATH
packaged resources/bin/conductor-rs
development .build/.tooling Cargo release output
development target/release output
```

Production desktop builds must not require users to install Rust, Cargo, or an
external CLI. Packaged macOS builds must preserve executable bits and include
the helper in signing/notarization validation.

Workbench services call domain IPC/preload methods; they must not know concrete
executable names outside the Electron main resolver boundary.

## Naming

Do not add generic Rust names in workbench services:

```txt
IRustService
RustBackend
processWithRust
applyTemplateWithRust
explorer.importFolderWithRust
```

Prefer domain/runtime names:

```txt
services/parameters/electron-browser/rcCalculationBackendService.ts
services/slice/electron-browser/sliceService.ts
services/plot/electron-browser/plotService.ts
services/export/electron-browser/exportService.ts
```

The `electron-browser` folder already signals desktop branch. Use `bridge`
only at preload/main IPC boundaries.

## Semantic Parity

TypeScript remains the semantic baseline. Rust may accelerate or mirror domain
execution, but it must not silently fork product rules.

When changing a rule mirrored under `cli/` or `extensions/`, update both sides
in the same change. This is mandatory for table-model family/role/confidence,
calculation, export, plot, search, and table rules with Rust branches.

Run the matching verifier. For table-model-derived planning:

```txt
npm run verify:rust-table-models-parity
```

If no verifier exists for a mirrored rule, add or extend one before relying on
the Rust branch.

## Stage Boundaries

Return data only at stable domain boundaries:

| Stage | TS owner | Rust may do | Return to TS |
| --- | --- | --- | --- |
| Table preview | table rows reader | chunk/cell/raw metadata reads | bounded rows or selected cells |
| Slice execution | slice service | extraction/process | `SliceRun`, series/curve descriptors, diagnostics |
| Plot | plot service | calculation, scaling, log transform, downsampling, plot frame | `PlotRenderModel` / bounded plot frame |
| Parameters | parameters/metric service | metrics and fits | `MetricRecord`, scalar values, bounded fit preview |
| Export | export service | stream CSV/ZIP/artifacts | artifact descriptor |
| Search | search service | indexed search | refs, snippets, counts |

Rust output is not a workbench record until a TypeScript service normalizes it:

```txt
Rust JSON
  -> service validation
  -> domain record normalization
  -> stale-result check
  -> Session commit or service event
```

## Payload Rules

Every long-lived Rust request must include enough identity to reject stale
results: request id, session version, file id, raw table id/version,
table-model version, template config fingerprint, curve signature, or other
stage-specific signature.

Before committing, check that the source still exists and versions/signatures
still match. Drop stale results silently unless a user-visible operation needs
a cancellation message.

Return freely:

- descriptors, ids, handles, versions, signatures;
- diagnostics and timings;
- scalar metrics;
- bounded preview rows or plot frames;
- export artifact paths.

Do not return by default:

- full normalized CSV text;
- whole raw tables;
- full curve point arrays;
- large intermediate metric arrays;
- full export text.

If a full payload remains for small files/tests, mark it as a compatibility path
and keep the large-file path artifact/handle based.

Names in canonical records should describe what the app has, not which runtime
produced it: `EngineDatasetRef`, `EngineCurveRef`, `ExportArtifactRecord`, not
`RustDataset`.

## Runtime Registration

`common` defines service contracts. Runtime folders select implementations.
Consumers import only common interfaces.

```txt
services/plot/common/plot.ts
services/plot/browser/plotService.ts
services/plot/electron-browser/plotService.ts
```

Fallback is owned by the domain service, not commands or views. Use
stage-specific fallback: browser parser only for safe file sizes/types,
normalized CSV reader for table preview, TS downsampling for small inline
curves, TS export only when output size is safe for JS memory. Do not write one
global fallback rule.

Rust runtime state is cache-like and must be disposable/rebuildable. Invalidate
or dispose it when files/raw tables/templates/curves/metrics/export artifacts
are removed or replaced, when Session clears, or when workers exit/crash.
TypeScript Session is the recovery source.

## File-Level Comment

If a new `electron-browser` file uses Rust heavily, a short comment is enough:

```ts
// Desktop implementation of Rc calculation. Uses conductor-rs for bounded numeric execution and returns metric descriptors.
```

## Do Not

- Do not create `IRustService` as a general-purpose workbench service.
- Do not expose Rust calls to views.
- Do not create Rust-specific command ids or `WithRust` methods.
- Do not let Rust mutate Session, Explorer, Table, Chart, or DOM state.
- Do not prefix canonical records with `Rust`.
- Do not return large payloads when an artifact path, handle, descriptor, preview slice, or plot frame is enough.
