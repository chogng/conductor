---
description: TableFile services - URI-backed file working copies, format policy, and encoding helpers.
applyTo: 'src/cs/workbench/services/tablefile/**'
---
# TableFile

`services/tablefile` follows upstream `workbench/services/textfile` naming for
file-backed table lifecycles. The target architecture is URI-backed:
`TableFileEditorModel` owns the file working-copy lifecycle around a
URI-backed `ITableModel`. Explicit converted data-file/raw-table imports are
Session ledger commits and no longer have a tablefile bridge service.

```txt
URI/resource open
  -> ITableModelService.createModelReference(resource)
  -> TableModelResolverService
  -> ITableFileService / BrowserTableFileService
  -> TableFileService chooses file read encoding
  -> TableFileEditorModelManager
  -> TableFileEditorModel
  -> ITableModel snapshot/version/sourceVersion
  -> Table / Template / Review / Slice consumers read URI-backed model facts

Explicit converted import
  -> fileConverter.ts FileConversionResult
  -> ISessionService.commitFileImport(...)
  -> SessionChangeEvent
  -> migration subscribers reread Session raw-table snapshots
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
- read encoding choice before the file is read;
- delegation to `TableFileEditorModelManager` for cached model creation,
  resolve, reload, and release.

Session owns the remaining explicit converted import ledger:

- imported data-file and raw-table lifecycle commits;
- `fileId`, `rawTableId`, and `sourceRawTableVersion` identity surface;
- rename/remove/clear operations for imported files;
- Session change events for subscribers.

This explicit converted import ledger does not own:

- URI-backed preview rows, file working-copy reload/watch state, or model caches;
- Explorer tree, selection, expansion, drag/drop UI, or pending-source rows;
- Table preview selection, row cache, reveal/highlight, or column widths;
- table-model detection, Recipe materialization, Review decisions, or Slice
  execution;
- plot/chart/search/export/parameter view state.

`services/tablefile/common/encoding.ts` is a helper for read mode and byte
conversion after the table format has already been identified. It must not
become the owner for supported extensions or parser dispatch. CSV/TSV/XLS/XLSX
belong to `TableFileFormatService` in
`services/tablefile/common/tableFileFormat.ts`; URI scheme describes resource
origin, and text `languageId` is not part of table file support.

## Migration Boundary

The retired imported-table-file bridge has been removed. Explicit converted
import flows call `ISessionService` after files conversion while the product
moves to URI-backed table opens. New table open, preview, cache, reload, save,
and source-version work should use
`TableFileEditorModel` / `ITableModel` through `ITableModelService`, not expand
Session-backed raw-table ownership.

Do not route table URI open/preview lifecycle through Session.
That lifecycle follows the upstream file -> editor shape and stays service-local
unless a user explicitly invokes the converted import path.

Explorer/files code may call `ISessionService.commitFileImport(...)`,
`renameFile(...)`, `removeFiles(...)`, or `clearSession()` only after it owns the
explicit conversion/removal workflow result. TableModel production commits
`TableModelRecord` values through `ISessionService` while Session remains the
canonical migration ledger.

## Core Files

| File | Responsibility |
| --- | --- |
| `common/tablefiles.ts` | `ITableFileService` contract for file-backed table working-copy lifecycle; not a converted import ledger. |
| `common/tableFileFormat.ts` | table file format policy and resource/name support checks for CSV/TSV/XLS/XLSX. |
| `browser/browserTableFileService.ts` | browser DI registration for the URI-backed table file service. |
| `browser/tableFileService.ts` | URI-backed file resolve service for table resources; owns read encoding choice before delegating to the editor model manager. |
| `common/encoding.ts` | table file read mode, base64/utf8 byte decoding, and mime helpers; not a table format/support owner. |
| `common/tableFileEditorModel.ts` | URI-backed file working-copy, file-backed read/preview/sourceVersion flow, and associated `ITableModel` lifecycle. |
| `common/tableFileEditorModelManager.ts` | file-backed table working-copy cache/reuse/reload/remove owner. |

## Rules

- Explicit import APIs act on pure values; records do not gain behavior methods.
- TableFile events are facts. Subscribers reread the resolved `ITableModel`
  snapshot after `onDidChangeModel`; explicit import subscribers still reread
  `ISessionService.getSnapshot()` after relevant `onDidChangeSession` events.
- Keep TableFile services independent of views, commands, and Table widget
  state.
- Keep table-model inference and derived record commits in
  `services/tableModel`; TableFile services do not derive or commit
  TableModel records.
