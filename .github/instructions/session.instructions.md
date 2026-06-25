---
description: Session service - canonical records, commit APIs, snapshots, read models, and change events.
applyTo: 'src/cs/workbench/services/session/**'
---
# Session

`SessionService` is the canonical in-memory ledger for the current analysis
session. It is not a view-state store, not a workflow dispatcher, and not the
public imported data-file owner surface. `ITableFileService` owns imported
data-file/raw-table lifecycle APIs and delegates to Session while the ledger
backs those records.

## Concepts

| Name | Meaning |
| --- | --- |
| `ISessionService` | public snapshot/events/commit API |
| `SessionService` | only mutator of `SessionModel` |
| `SessionModel` | internal canonical data state |
| `SessionSnapshot` | read-only consumer data |
| `SessionReadModel` | derived read projection |
| `SessionChangeEvent` | specific invalidation event |
| `ITableFileService` | imported table-file/raw-table owner API backed by Session during migration |

## Core Files

| File | Responsibility |
| --- | --- |
| `common/session.ts` | service contract, snapshot, commit inputs, events. |
| `common/sessionModel.ts` | canonical records: files, raw, table model, reviews, slice runs, series, curves, metrics, cache. |
| `common/sessionEvents.ts` | change reasons, affected ids, helper types. |
| `common/sessionReadModel.ts` | read-only projections. |
| `common/sessionModelAdapter.ts` | compatibility projections between raw/processed helper payloads and canonical records; shrink over time. |
| `browser/sessionService.ts` | mutable model owner, validation, versioning, events. |

## Canonical Data Only

Session may store imported files, raw tables/versions, table model, reviews,
slice runs, series, curves, metrics, metric inputs, and rebuildable calculation
cache descriptors.

Session must not store URI/editor input models, format support-check results,
preview rows, watch/reload state, cache entries, active resource/view input,
table selection/focus/scroll, chart zoom/popovers, active plot tabs, template
drafts, search queries, export dialog state, worker refs, request ids, row
caches, or thumbnail caches.

## Commit Rules

- Every canonical mutation goes through `SessionService`.
- Every commit validates affected ids.
- Import commits return committed file ids and skipped duplicate source ids for caller follow-up.
- Table-model commits check `sourceRawTableVersion`.
- Raw table replacement invalidates stale TableModel, reviews, slice runs, curves, and metrics for that raw table.
- Calculation output that includes derived curves and metrics should use `commitCalculatedRecordsBatch`.
- Events include affected ids; consumers ignore unrelated changes.

## Workflow Boundary

Commands may call Session backing commit methods only after another owner
service/controller has produced the domain result. Imported data-file and raw
table lifecycle callers use `ITableFileService`; TableModel production commits
derived `TableModelRecord` values through Session while it remains the
migration ledger.

Opening or previewing a table URI follows upstream file -> editor ownership and
is not a Session workflow. Session only receives explicit conversion/import
results and downstream analysis records.

| Workflow | Preferred producer | Session method |
| --- | --- | --- |
| import | `ITableFileService` after Explorer source workflow conversion | `commitFileImport` backing API |
| table model | `ITableModelService` / table-model queue | `commitTableModel` backing API |
| review | review contribution/command after candidate review | `commitRawTableReviews` |
| slice | slice service after planning/execution | `commitSliceRuns` |
| calculated curves/metrics | calculation service | `commitCalculatedRecordsBatch` |
| metric input | parameters service | `setMetricInput` / `clearMetricInput` |
| file removal | `ITableFileService` after Explorer action/controller | `removeFiles` backing API plus separate Explorer selection follow-up |
| clear imported table files/session | `ITableFileService` or global Workbench command | `clearSession` backing API |

Do not make another service fire request/submit events only so Workbench can
mutate Session. The caller that owns the workflow result calls the owning
service API, and consumers react to owner change events.

Production Explorer/files/TableModel code should not call the import,
table-model, rename, remove, or clear backing APIs directly. Use
`ITableFileService` so imported data-file ownership stays separate from the
analysis ledger.

Do not add Template-owned run/output commit or cleanup APIs. Template execution
results enter Session only through Slice commits.

## Field Catalog

Use `records.instructions.md` for `SessionModel`, `FileRecord`,
`SeriesRecord`, `CurveRecord`, `MetricRecord`, and related canonical fields.

## Do Not

- Do not expose mutable `SessionModel`.
- Do not let views call internal adapters.
- Do not collapse all changes into `Event<void>`.
- Do not make `SessionService` call Chart/Table/Template directly.
- Do not store service caches or UI state in `FileRecord`.
- Do not add global `activeTarget`; use owner-specific active state and command targets.
