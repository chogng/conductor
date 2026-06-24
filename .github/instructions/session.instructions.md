---
description: Session service - canonical records, commit APIs, snapshots, read models, and change events.
applyTo: 'src/cs/workbench/services/session/**'
---
# Session

`SessionService` is the canonical in-memory ledger for the current analysis
session. It is not a view-state store and not a workflow dispatcher.

## Concepts

| Name | Meaning |
| --- | --- |
| `ISessionService` | public snapshot/events/commit API |
| `SessionService` | only mutator of `SessionModel` |
| `SessionModel` | internal canonical data state |
| `SessionSnapshot` | read-only consumer data |
| `SessionReadModel` | derived read projection |
| `SessionChangeEvent` | specific invalidation event |

## Core Files

| File | Responsibility |
| --- | --- |
| `common/session.ts` | service contract, snapshot, commit inputs, events. |
| `common/sessionModel.ts` | canonical records: files, raw, table facts, reviews, slice runs, series, curves, metrics, cache. |
| `common/sessionEvents.ts` | change reasons, affected ids, helper types. |
| `common/sessionReadModel.ts` | read-only projections. |
| `common/sessionModelAdapter.ts` | temporary legacy adapter; shrink over time. |
| `browser/sessionService.ts` | mutable model owner, validation, versioning, events. |

## Canonical Data Only

Session may store imported files, raw tables/versions, table facts, reviews,
slice runs, series, curves, metrics, metric inputs, and rebuildable calculation
cache descriptors.

Session must not store table selection/focus/scroll, chart zoom/popovers, active
plot tabs, template drafts, search queries, export dialog state, worker refs,
request ids, row caches, or thumbnail caches.

## Commit Rules

- Every canonical mutation goes through `SessionService`.
- Every commit validates affected ids.
- Import commits return committed file ids and skipped duplicate source ids for caller follow-up.
- Table-fact commits check `sourceRawTableVersion`.
- Raw table replacement invalidates stale table facts, reviews, slice runs, curves, and metrics for that raw table.
- Calculation output that includes derived curves and metrics should use `commitCalculatedRecordsBatch`.
- Events include affected ids; consumers ignore unrelated changes.

## Workflow Boundary

Commands may call Session commit methods only after another service/controller
has produced the domain result.

| Workflow | Preferred producer | Session method |
| --- | --- | --- |
| import | Explorer source workflow after conversion | `commitFileImport` |
| table facts | table-fact producer | `commitRawTableFacts` |
| review | review contribution/command after candidate review | `commitRawTableReviews` |
| slice | slice service after planning/execution | `commitSliceRuns` |
| calculated curves/metrics | calculation service | `commitCalculatedRecordsBatch` |
| metric input | parameters service | `setMetricInput` / `clearMetricInput` |
| file removal | Explorer action/controller | `removeFiles` plus separate Explorer selection follow-up |
| clear session | Explorer or global Workbench command | `clearSession` |

Do not make another service fire request/submit events only so Workbench can
mutate Session. The caller that owns the workflow result calls Session, and
consumers react to `SessionChangeEvent`.

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
