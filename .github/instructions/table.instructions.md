---
description: Table service - raw/block table preview, row paging, selection, focus, highlight, reveal, and table widget boundaries.
applyTo: 'src/cs/workbench/services/table/**,src/cs/workbench/contrib/table/**'
---
# Table

Table shows raw tables and assessment block ranges. It does not identify
measurement structure.

## Ownership

`ITableService` owns:

- current `TableSource`;
- externally visible selection snapshot for commands/copy;
- selected text generation;
- focus/reveal/highlight state;
- column width persistence;
- column-level display profiles for numeric presentation;
- paged raw rows cache, loading state, row request lifecycle, worker lifecycle;
- block table preview model and invalidation when source changes.

It consumes Session snapshots, raw table row readers, assessment ranges,
settings for visual display preferences, and pure `TableSource` open intents.
It does not own import, assessment, template execution, plot/chart models, or
canonical Session records.

## Core Files

| File | Responsibility |
| --- | --- |
| `services/table/common/table.ts` | service contract, model contracts, source key helpers. |
| `common/tableColumnLayout.ts` | width policy and storage serialization. |
| `common/tableDisplayProfile.ts` / `numericFormat.ts` | display profile and numeric formatting helpers. |
| `browser/tableService.ts` | table service owner, view input, copy text, column width persistence. |
| `browser/tableModel.ts` | per-table data model: source switching, row cache, selection/highlight/reveal, worker/reader lifecycle. |
| `browser/tableRowsReaderService.ts` | browser row reader fallback. |
| `electron-browser/tableRowsReader.ts` | desktop row/cell reads through Rust IPC/preload. |
| `contrib/table/browser/tableWidget.ts` | grid DOM, virtual scroll, keyboard/mouse/wheel, local selection, zoom, column resize. |
| `contrib/table/browser/tableController.ts` | adapter from view input/callbacks to widget props. |
| `contrib/table/browser/tableWidgetService.ts` | active widget controller registry for commands. |
| `contrib/table/browser/tableCommands.ts` / `tableActions.ts` | commands and action registration. |

`tableModel.ts` is the owner for table data-plane helpers. Do not split row
cache, cell-read, or selection-state helpers into production files unless they
become an independent service boundary.

## Flow

```txt
Session/settings/command/search bridge
  -> ITableService.open(source) / reveal / select
  -> tableModel loads rows through reader
  -> TableController consumes view input
  -> TableWidget renders and emits selection/width/zoom callbacks
  -> TableService stores external selection and width state
```

## Selection

Selection belongs to the active `TableWidget` interaction surface and is synced
to `ITableService` as a snapshot for commands, copy, and cross-feature reveal.
It is not Session canonical data.

Targets are pure records:

```ts
type TableSelectionTarget =
  | { readonly kind: "cell"; readonly cell: TableCell | null }
  | { readonly kind: "range"; readonly range: TableRange }
  | { readonly kind: "columns"; readonly columns: readonly number[] };
```

Use owner APIs such as `tableWidget.select(...)`,
`tableService.open(source)`, `tableService.select(...)`,
`tableService.reveal(...)`, and `tableModel.setSelection(...)`. Do not add
behavior methods to `TableCell` or `TableRange`.

## Commands

Data/selection/copy commands delegate to `ITableService`. Zoom commands resolve
`ITableWidgetService.activeController` and call the widget/controller API.

Search result navigation may dispatch to table commands when a result points to
`RawTableRangeRef`.

`WorkbenchDomainBridge` may derive a `TableSource` from Explorer/session state,
but external callers pass only the source target. They do not pass raw rows,
files, table models, or widget lifecycle callbacks.

Table panes subscribe to `ITableService.onDidChangeTableViewInput` and reread
`ITableService.getViewInput()`. Do not use event payloads as the data path.

## Field Catalog

Use `records.instructions.md` for `TableState`, `TableSource`,
`TableSelection`, and `TableColumnWidth`.

## Do Not

- Do not detect headers or block boundaries in table code.
- Do not apply templates from table code.
- Do not put row caches or worker refs in Session.
- Do not call Chart/Plot directly from table selection logic.
- Do not let `TableWidget` import table services, storage services, or command services.
