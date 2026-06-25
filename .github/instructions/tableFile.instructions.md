---
description: TableFile services - URI-backed file working copies plus imported table-file migration bridge.
applyTo: 'src/cs/workbench/services/tablefile/**'
---
# TableFile

`services/tablefile` follows upstream `workbench/services/textfile` naming for
file-backed table lifecycles. The target architecture is URI-backed:
`TableFileEditorModel` owns the file working-copy lifecycle around a
URI-backed `ITableModel`, while `ITableFileService` remains the imported
data-file/raw-table migration bridge backed by Session.

```txt
URI/resource open
  -> ITableModelService.createModelReference(resource)
  -> TableFileEditorModelManager
  -> TableFileEditorModel
  -> ITableModel snapshot/version/sourceVersion
  -> Table / Template / Review / Slice consumers read URI-backed model facts

Legacy explicit import
  -> fileConverter.ts FileConversionResult
  -> ITableFileService.commitImport(...)
  -> table-file change event
  -> migration subscribers reread imported raw-table snapshots
```

## Ownership

`TableFileEditorModel` owns:

- URI-backed file working-copy identity and lifecycle;
- file stat/watch/reload/save/revert/orphan/conflict/dirty state;
- `sourceVersion` as the stable source-version basis for downstream stale
  checks;
- updates to the associated `ITableModel` after file content changes.

`ITableFileService` owns the legacy explicit import bridge:

- imported data-file and raw-table lifecycle API;
- `fileId`, `rawTableId`, and `sourceRawTableVersion` identity surface;
- rename/remove/clear operations for imported table files;
- table-file change events for subscribers.

TableFile does not own:

- file format filtering, preview rows, reload/watch state, or model caches;
- Explorer tree, selection, expansion, drag/drop UI, or pending-source rows;
- Table preview selection, row cache, reveal/highlight, or column widths;
- table-model detection, Recipe materialization, Review decisions, or Slice
  execution;
- plot/chart/search/export/parameter view state.

## Migration Boundary

`ITableFileService` currently delegates storage and mutation to
`ISessionService`. This is intentional compatibility shape for explicit import
flows while the product moves to URI-backed table opens. New table open,
preview, cache, reload, save, and source-version work should use
`TableFileEditorModel` / `ITableModel` through `ITableModelService`, not expand
Session-backed raw-table ownership.

Do not route table URI open/preview lifecycle through `ITableFileService`.
That lifecycle follows the upstream file -> editor shape and stays service-local
unless a user explicitly invokes the legacy conversion/import path.

Do not call `ISessionService.commitFileImport(...)`,
`renameFile(...)`, `removeFiles(...)`, or `clearSession()` from Explorer/files
code. Use
`ITableFileService` owner APIs and let the backing implementation decide how the
ledger is stored. TableModel production may commit `TableModelRecord` values
through `ISessionService` while Session remains the canonical migration ledger.

## Core Files

| File | Responsibility |
| --- | --- |
| `common/tableFile.ts` | service contract and snapshot/change aliases for legacy imported table files. |
| `browser/tableFileService.ts` | imported table-file bridge backed by `ISessionService` during migration. |
| `common/tableFileEditorModel.ts` | URI-backed file working-copy and associated `ITableModel` lifecycle. |
| `common/tableFileEditorModelManager.ts` | file-backed table working-copy cache/reuse/reload/remove owner. |
| `common/tableFileEditorModelContentResolver.ts` | Conductor-specific runtime content resolver that reads URI resource bytes/text, builds `File`/preview/sourceVersion metadata, and delegates CSV/TSV/XLSX parsing to `services/table/common/tableModelContentParser.ts`; it must not route URI-backed opens through the legacy import/conversion chain. |

## Rules

- `ITableFileService` APIs act on pure values; records do not gain behavior
  methods.
- Events are facts. Subscribers must reread `getSnapshot()` after
  `onDidChangeTableFiles`.
- Keep TableFile services independent of views, commands, and Table widget
  state.
- Keep table-model inference and derived record commits in
  `services/tableModel`; TableFile services do not derive or commit
  TableModel records.
