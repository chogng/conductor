---
description: Session service - canonical records, commit APIs, snapshots, and change events.
applyTo: 'src/cs/workbench/services/session/**'
---
# Session

`SessionService` is the canonical in-memory ledger for the current analysis
session. It is not a view-state store and not a workflow dispatcher. It now owns
the remaining imported data-file/raw-table lifecycle APIs directly
for the migration ledger, while URI-backed table opens stay in tableFile/editor
model services.

## Concepts

| Name | Meaning |
| --- | --- |
| `ISessionService` | public snapshot/events/commit API |
| `SessionService` | only mutator of `SessionModel` |
| `SessionModel` | internal canonical data state |
| `SessionSnapshot` | read-only consumer data |
| `SessionChangeEvent` | specific invalidation event |
| migration-ledger explicit import APIs | `ISessionService.commitFileImport`, rename, remove, and clear for migration-ledger raw tables; not the Explorer ordinary file-to-table path |

## Core Files

| File | Responsibility |
| --- | --- |
| `common/session.ts` | service contract, snapshot, commit inputs, events. |
| `common/sessionModel.ts` | canonical records: files, raw, table model, slice runs, series, curves, metrics, cache. |
| `common/sessionEvents.ts` | change reasons, affected ids, helper types. |
| `browser/sessionService.ts` | mutable model owner, validation, versioning, events. |

## Canonical Data Only

Session may store migration-ledger imported files, raw tables/versions, and
legacy canonical analysis records. URI-backed Slice and Calculation results
stay in their owning services.

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
- Raw table replacement invalidates stale TableModel, slice runs, curves, and metrics for that raw table.
- Events include affected ids; consumers ignore unrelated changes.

## Workflow Boundary

Commands may call Session commit methods only after another owner
service/controller has produced the domain result. Ordinary Explorer
file-to-table imports stay out of Session after source preparation: Explorer owns
local visible rows and hands off URI resources to `ITableService`.

Opening or previewing a table URI follows upstream file -> editor ownership and
is not a Session workflow. Session only receives migration-ledger raw-table
records and downstream analysis records.

| Workflow | Preferred producer | Session method |
| --- | --- | --- |
| migration-ledger raw import | migration owner after raw-table import preparation | `commitFileImport` |
| metric input | parameters service | `setMetricInput` / `clearMetricInput` |
| migration-ledger file removal | migration owner after file workflow succeeds | `removeFiles` |
| clear migration-ledger imported table files/session | migration/global Workbench command | `clearSession` |

Do not make another service fire request/submit events only so Workbench can
mutate Session. The caller that owns the workflow result calls the owning
service API, and consumers react to owner change events.

Production Explorer/files code must not call Session import, rename, remove, or
clear APIs for the ordinary file-to-table path. Do not route URI open/preview
lifecycle through Session.

URI-backed Slice run/output results stay in `ISliceService`; do not add new
Session commit or cleanup APIs for them.

Do not add a Session commit API for `CalculationResourceResult`. Plot and
Parameters consume URI-backed calculated results through `ICalculationService`.

## Do Not

- Do not expose mutable `SessionModel`.
- Do not let views call internal adapters.
- Do not collapse all changes into `Event<void>`.
- Do not make `SessionService` call Chart/Table/Template directly.
- Do not store service caches or UI state in `FileRecord`.
- Do not add global `activeTarget`; use owner-specific active state and command targets.
