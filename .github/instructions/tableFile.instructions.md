---
description: TableFile service - imported data-file/raw-table model owner and upstream TextFileService equivalent.
applyTo: 'src/cs/workbench/services/tableFile/**'
---
# TableFile

`ITableFileService` owns the imported data-file/raw-table model surface. It is
Conductor's counterpart to upstream `TextFileService` / working-copy model
ownership: Explorer is UI, Table is the preview/editor surface, and TableFile is
the canonical data-file model API.

```txt
Explorer source workflow
  -> fileConverter.ts FileConversionResult
  -> ITableFileService.commitImport(...)
  -> table-file change event
  -> TableFacts / Table / Review / Slice / Plot subscribers reread snapshots
```

## Ownership

TableFile owns:

- imported data-file and raw-table lifecycle API;
- `fileId`, `rawTableId`, and `sourceRawTableVersion` identity surface;
- rename/remove/clear operations for imported table files;
- committing TableFacts back to the canonical table-file model;
- table-file change events for subscribers.

TableFile does not own:

- Explorer tree, selection, expansion, drag/drop UI, or pending-source rows;
- Table preview selection, row cache, reveal/highlight, or column widths;
- table-fact detection, Recipe materialization, Review decisions, or Slice
  execution;
- plot/chart/search/export/parameter view state.

## Migration Boundary

Current implementation delegates storage and mutation to `ISessionService`.
This is intentional migration shape: callers should depend on
`ITableFileService` for imported table-file ownership, while Session remains the
ledger backing until raw table records are fully separated from analysis
records.

Do not call `ISessionService.commitFileImport(...)`,
`commitRawTableFacts(...)`, `renameFile(...)`, `removeFiles(...)`, or
`clearSession()` from Explorer/files/TableFacts production code. Use
`ITableFileService` owner APIs and let the backing implementation decide how the
ledger is stored.

## Core Files

| File | Responsibility |
| --- | --- |
| `common/tableFile.ts` | service contract, snapshot/change aliases, import/facts commit options. |
| `browser/tableFileService.ts` | injectable owner surface backed by `ISessionService` during migration. |

## Rules

- TableFile APIs act on pure values; records do not gain behavior methods.
- Events are facts. Subscribers must reread `getSnapshot()` after
  `onDidChangeTableFiles`.
- Keep TableFile independent of DOM, views, commands, and Table widget state.
- Keep table-fact inference in `services/tableFacts`; TableFile stores the
  result, it does not derive it.
