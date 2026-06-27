---
description: TableFile services - URI-backed file working copies and table text/byte helpers.
applyTo: 'src/cs/workbench/services/tableFile/**'
---
# TableFile

`services/tableFile` follows upstream `workbench/services/textfile` naming for
file-backed table lifecycles. The target architecture is URI-backed:
`TableFileEditorModel` owns the file working-copy lifecycle around a
URI-backed `ITableModel`. Migration-ledger data-file/raw-table imports are
Explorer-local file-to-table rows plus URI-backed table opens, and no longer
have a tableFile bridge service or Session commit step.

```txt
URI/resource open
  -> ITableModelService.createModelReference(resource)
  -> TableModelResolverService
  -> ITableFileService / BrowserTableFileService
  -> TableFileService chooses table read mode
  -> TableFileEditorModelManager
  -> TableFileEditorModel
  -> ITableModel snapshot/version/sourceVersion
  -> Table / Template / Review / Slice consumers read URI-backed model facts

Explicit Explorer import
  -> fileImportExport.ts PreparedFileImport
  -> Explorer-local imported rows
  -> ITableService.open({ resource })
  -> TableFileEditorModel / ITableModel own URI-backed model lifecycle
```

## Ownership

`TableFileEditorModel` owns:

- URI-backed file working-copy identity and lifecycle;
- file stat/watch/reload/save/revert/orphan/conflict/dirty state;
- `sourceVersion` as the stable source-version basis for downstream stale
  checks;
- updates to the associated `ITableModel` after file content changes.

`TableFileService` owns the file-backed branch between resolver and editor model:

- file-backed table resource support checks after resolver/provider dispatch;
- table text/byte read mode choice after platform bytes are read;
- delegation to `TableFileEditorModelManager` for cached model creation,
  resolve, reload, and release.

Session owns only the remaining migration ledger for domains that still
explicitly write canonical records:

- imported data-file and raw-table lifecycle commits;
- `fileId`, `rawTableId`, and `sourceRawTableVersion` identity surface;
- rename/remove/clear operations for imported files;
- Session change events for subscribers.

This remaining raw-table import ledger does not own:

- URI-backed preview projections, file working-copy reload/watch state, or model caches;
- Explorer tree, selection, expansion, drag/drop UI, or pending-source rows;
- Table preview selection, row cache, reveal/highlight, or column widths;
- table-model detection, Review candidate derivation, Review decisions, or Slice
  execution;
- plot/chart/search/export/parameter view state.

`services/tableFile/common/encoding.ts` is a helper for table read mode and byte
conversion after the table format has already been identified. It must not
become the owner for supported extensions or parser dispatch. CSV/TSV/XLS/XLSX
belong to `TableFormatService` in
`services/table/common/tableFormatService.ts`; URI scheme describes resource
origin, and text `languageId` is not part of table file support.

## Migration Boundary

Explicit Explorer import flows stay out of Session after source preparation:
they update Explorer-local rows and open URI-backed table resources. New table
open, model projection, cache, reload, save, and source-version work should use
`TableFileEditorModel` / `ITableModel` through `ITableModelService`, not expand
Session-backed raw-table ownership.

Do not route table URI open/model projection lifecycle through Session.
That lifecycle follows the upstream file -> editor shape and stays service-local
unless a user explicitly invokes a migration-ledger raw-table path.

Explorer/files code must not call `ISessionService.commitFileImport(...)` for
ordinary file-to-table imports.

## Core Files

| File | Responsibility |
| --- | --- |
| `common/tablefiles.ts` | `ITableFileService` contract for file-backed table working-copy lifecycle; not a raw-table import ledger. |
| `common/tableFileReader.ts` | URI-backed table file reader; reads platform bytes, selects table text/byte mode after format resolution, and returns `TableReadBuffer`. |
| `browser/browserTableFileService.ts` | browser DI registration for the URI-backed table file service. |
| `browser/tableFileService.ts` | URI-backed file resolve service for table resources; owns table read mode choice before delegating to the editor model manager. |
| `common/encoding.ts` | table file text/byte mode, byte conversion, and mime helpers; not a table format/support owner. |
| `common/tableFileEditorModel.ts` | URI-backed file working-copy, file-backed read/sourceVersion flow, and associated `ITableModel` lifecycle. |
| `common/tableFileEditorModelManager.ts` | file-backed table working-copy cache/reuse/reload/remove owner. |

## Rules

- Explicit import APIs act on pure values; records do not gain behavior methods.
- TableFile events are facts. Subscribers reread the resolved `ITableModel`
  snapshot after `onDidChangeModel`; explicit import subscribers still reread
  `ISessionService.getSnapshot()` after relevant `onDidChangeSession` events.
- Keep TableFile services independent of views, commands, and Table widget
  state.
- TableFile services do not derive review candidates or commit derived Session
  records.
