---
description: Table service - raw/block table preview, row paging, selection, focus, highlight, reveal, and table widget boundaries.
applyTo: 'src/cs/workbench/services/table/**,src/cs/workbench/contrib/table/**'
---
# Table

For the table URI/editor-model migration, `.github/instructions/迁移说明.md`
has higher priority than this file and other table/model/session notes. If a
rule here conflicts with that migration document, follow the migration document.

Table shows raw tables and table-model block ranges. It does not identify
measurement structure.

## Ownership

`ITableService` owns:

- current `TableSource`;
- externally visible selection snapshot for commands/copy;
- selected text generation;
- focus/reveal/highlight state;
- column width persistence;
- column-level display profiles for numeric presentation;
- paged resource rows cache, loading state, and row request lifecycle;
- block table preview model and invalidation when source changes.

It consumes URI-backed `ITableModel` snapshots plus service-projected view source data, table-model ranges,
settings for visual display preferences, and resource-backed `TableSource`
open intents. It does not own import,
table-model production, template execution, plot/chart models, or canonical
Session records.

`TableSource.resource` is the primary open identity for file -> table preview,
matching the upstream file -> editor shape. `TableSource.sheetId`, when
present, selects a sheet inside that resource. `ITableService.open(...)`
rejects non-resource sources.

Use the common helpers from `services/table/common/table.ts` when normalizing,
comparing, or keying `TableSource` values. URI-backed table view/cache/storage
keys should use `toTableSheetKey` from `resource + sheetId`. Do not duplicate
sheet-key derivation rules in service/view files.

## Core Files

| File | Responsibility |
| --- | --- |
| `services/table/common/table.ts` | service contract, model contracts, URI-backed sheet-key helper, and table source normalization helpers. |
| `services/table/common/model.ts` | URI-backed `ITableModel` content model, ranges, selection value helpers, decorations, parser diagnostics, resource/formatted content snapshots, `defaultSheetId`, and version events; service-local, not Session. Sheet snapshots store `sheetId`/`sheetName`/content plus sheet-level parser diagnostics; derived `sheetKey` stays in table service/view adapters. Model snapshots do not own view projection or Explorer item identity. |
| `services/table/common/resolverService.ts` | URI -> `ITableModel` reference service contract, following upstream resolver service shape. |
| `services/table/common/tableModelResolverService.ts` | `ITableModelService` implementation: URI -> `ITableModel` reference, support check, reference/cache entry, content-provider/file-backed dispatch, and reference-counted cache release. |
| `services/table/common/tableFormatRegistry.ts` | known `TableFormatId` registrations, materialization capability, and default extension metadata. |
| `services/table/common/tableFormatAssociations.ts` | resource/name/extension association helpers for table format resolution. |
| `services/table/common/tableFormatService.ts` | table format policy and resource/name support checks; owns CSV/TSV/XLS/XLSX classification and materialization capability, not URI scheme, read encoding, or languageId. |
| `services/table/common/tableReadBuffer.ts` | table-owned text/byte read buffer contracts between tableFile reader and parser. |
| `services/table/common/tableStructureParser.ts` | CSV/TSV/XLS/XLSX `TableReadBuffer` -> physical table structure snapshots for `ITableModel` content and sheets. |
| `services/tableFile/common/tablefiles.ts` | `ITableFileService` contract for the file-backed table working-copy branch. |
| `services/tableFile/common/tableFileReader.ts` | URI-backed table file reader; consumes `TableFormatId` policy and table text/byte helpers to produce `TableReadBuffer`. |
| `services/tableFile/browser/browserTableFileService.ts` | browser DI registration for the file-backed table working-copy service. |
| `services/tableFile/browser/tableFileService.ts` | file-backed table resolve service: validates table file support, chooses table read mode, and delegates cached file editor models to the manager. |
| `services/tableFile/common/encoding.ts` | table file text/byte mode, byte conversion, and mime helpers. |
| `services/tableFile/common/tableFileEditorModel.ts` | URI-backed `TableFileEditorModel`: file working-copy lifecycle, file-backed read/sourceVersion flow, and updates to the associated `ITableModel`. |
| `common/tableColumnLayout.ts` | width policy and storage serialization. |
| `common/tableDisplayProfile.ts` / `numericFormat.ts` | display profile and numeric formatting helpers. |
| `services/tableFile/common/tableFileEditorModelManager.ts` | file-backed table model manager: cache/reuse, reload/remove, pending resolve de-duplication, and model change events. |
| `browser/tableService.ts` | table service owner, view input, copy text, column width persistence. |
| `browser/tableViewModel.ts` | per-table preview view model: source switching, resource row cache, selection/highlight/reveal, and row request lifecycle. |
| `base/browser/ui/table/tableWidget.ts` / `table.css` | Conductor-specific two-dimensional table widget facade and structural CSS over the virtual table base. |
| `base/browser/ui/table/virtualTable.ts` | two-dimensional virtual table engine: visible range calculation, pooled corner/header/body DOM, scroll spacers, cell descriptor rebinding, and scroll/visible-range fact events. |
| `contrib/table/browser/tableWidget.ts` | raw table adapter/renderers over the base table widget, keyboard/mouse/wheel, local selection, zoom controls, and column width persistence callbacks. |
| `contrib/table/browser/tableController.ts` | adapter from view input/callbacks to widget props. |
| `contrib/table/browser/tableWidgetService.ts` | active widget controller registry for commands. |
| `contrib/table/browser/tableDropTarget.ts` | table preview resource-drop target, following the upstream editor drop-target shape and delegating DataTransfer source collection to files helpers. |
| `contrib/table/browser/tableCommands.ts` / `tableActions.ts` | commands and action registration. |

`tableViewModel.ts` is the owner for table preview data-plane helpers. Do not
split row cache, cell-read, or selection-state helpers into production files
unless they become an independent service boundary.

## Resource Format Boundary

Treat `.csv`, `.tsv`, `.xls`, and `.xlsx` as `TableFormatId` values. They are
not URI schemes, text `languageId`s, or standalone encodings.
Ordinary import/open support includes CSV, TSV, XLS, and XLSX. `.xls` is read
as bytes so the parser can handle legacy HTML/SpreadsheetML workbooks directly.
Binary BIFF/OLE `.xls` may be read by the desktop `NativeTableFileService`;
the browser/common path returns a clear unsupported diagnostic when that native
reader is not supplied.

```txt
URI scheme -> resource origin/provider, such as file: or table-memory:
TableFormatId -> table content format, such as csv, tsv, xls, xlsx
table read mode -> table decode strategy, such as text or bytes
languageId -> text editor grammar identity; not used for table support checks
```

`TableModelResolverService` may dispatch by scheme/provider to decide how a
resource is obtained, but table support and parser choice must flow through
`TableFormatService`. `.txt` is unsupported unless that format policy is
explicitly changed.

## Flow

```txt
Session/settings/command/search bridge
  -> ITableService.open(source) / reveal / select
  -> ITableService holds the active ITableModelService.createModelReference(resource) for the preview lifetime
  -> resource sources resolve through ITableModelService / services/table/common/tableModelResolverService by URI
  -> tableModelResolverService resolves provider-backed virtual resources or delegates file-backed resources to tableFile browser/native tableFileService registration
  -> tableFormatService validates table file support before tableFileService chooses table read mode and delegates to tableFileEditorModelManager
  -> NativeTableFileService supplies a desktop TS `.xls` sheet-row reader only for binary `.xls` resolves; CSV/TSV/XLSX stay on the ordinary tableFile path
  -> tableFileEditorModelManager resolves/reloads cached TableFileEditorModel instances
  -> TableFileEditorModel owns file watch, dirty/save/revert, orphan/conflict state, and sourceVersion; it reads resources through tableFileReader into TableReadBuffer and delegates CSV/TSV/XLS/XLSX physical table structure parsing to tableStructureParser.ts
  -> ITableModel snapshot owns parsed CSV/TSV/XLS/XLSX content, parser diagnostics, defaultSheetId, and sheet content without storing derived sheet keys
  -> tableService/tableViewModel derives migration preview projection from TableModelSnapshot without pushing it into TableModelResolvedContent
  -> tableViewModel reads resource-backed ITableModel content without converting the source identity into a raw fileId
  -> TableController consumes view input
  -> TableWidget adapts table state to base table widget renderers
  -> base table widget owns structural CSS, zoom state, column resize mechanics, and facade defaults
  -> base VirtualTable reuses visible cell DOM and emits scroll/visible-range facts
  -> TableWidget emits selection callbacks and exposes base size/zoom/column-resize callbacks
  -> TableService stores external selection and width state

TableWidget header scale badge / shared stepper
  -> TableViewPane derives header selection and scale-adjustment policy from template mode
  -> TableController forwards the policy to TableWidget
  -> TableWidget keeps column selection and scale adjustment mutually exclusive
  -> ITableService.adjustColumnDisplayScale / resetColumnDisplayScale
  -> TableService delegates to its active tableViewModel
  -> tableViewModel emits display rows-version dirty ranges
  -> TableWidget rerenders affected visible cells and header scale controls
```

## Base Table Boundary

The base table owns UI mechanics that are independent of raw-table semantics:

- virtual scroll math, overscan, visible row/column ranges, and spacer sizing;
- table size snapshots from the row/column counts passed by feature code;
- zoom state, zoom bounds, zoom scale CSS, and zoom geometry used for row
  height, column width scaling, reveal, and resize guides;
- column resize interaction mechanics, including header boundary hit testing,
  drag tracking, resize guide display, zoom-aware width deltas, and the
  `onDidResizeColumn` fact event;
- pooled corner/header/row-header/body DOM and descriptor rebinding;
- structural CSS hooks, header/body scroll synchronization, and reveal geometry;
- fact events such as `onDidScroll`, `onDidChangeVisibleRange`,
  `onDidChangeSize`, and `onDidChangeZoom`.

Pure grid geometry helpers live in the base `VirtualTableGridModel`. Contrib
imports those helpers directly and must not re-export compatibility wrappers or
add geometry, resize, label, or keyboard navigation algorithms there.

Follow the upstream widget shape: feature code depends on the base
`TableWidget` facade as the single owner surface. Do not expose or pass around a
map of structural class names. The base table owns those hooks and feature code
adds at most a root class plus domain-specific state classes or data attributes.
`TableWidget` should compose the lower-level virtual table engine instead of
inheriting from it, so engine DOM parts do not become public widget API by
accident.

Feature widgets consume those facts by subscribing and rereading owner state.
They should not make each logical cell a long-lived component or subscribe each
cell to model data. Instead, the feature widget adapts model state into render
versions and cell/header renderers for the currently visible pool.

Row/cache updates are aggregated by the table model. `subscribeRowsVersion`
emits dirty ranges as half-open model coordinates; the base widget intersects
those ranges with the current visible row/column span and rerenders only pooled
body cells that are visible and affected. Feature widgets decide whether a
dirty kind is safe for body-only patching. Column display-profile dirty ranges
must also resync affected visible headers because formatting policy is shown in
header scale controls. Layout, reset, or structure changes may still rerender
the whole visible table because they can affect headers, geometry, or formatting
policy.

When a body cell stays bound to the same model row/column and only its render
version changes, the base table should call the content-only body renderer
instead of rebinding the cell container. Rebinding pooled cell containers is for
scroll/visible-range descriptor changes, not for source data text changes.
Column header render versions should stay separate from body data render
versions so switching source row content does not force header, frame, focus, or
selection DOM state to be rewritten.

Keep domain behavior out of the base table:

- raw row cache, worker requests, source identity, and selected text belong to
  `ITableService` / `tableViewModel`;
- numeric formatting, display profiles, persisted column widths, and table
  source lifecycle stay in the table feature owner;
- zoom controls, commands, and persistence policy may be feature-specific, but
  they should drive the base table zoom API instead of duplicating zoom state;
- column width persistence and sheet-key scoping stay in `ITableService` /
  the table feature owner; feature widgets should subscribe to base resize
  facts and call their own width owner APIs;
- selection/focus/highlight can use base geometry helpers, but persistence and
  command-visible snapshots remain owned by the active table widget/service.

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
`tableService.reveal(...)`, and `tableViewModel.setSelection(...)`. Do not add
behavior methods to `TableCell` or `TableRange`. Selection/reveal cells and
ranges are coordinates in the currently open table; they do not carry Explorer
`fileId`, raw-table identity, source key, or derived sheet key.

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
