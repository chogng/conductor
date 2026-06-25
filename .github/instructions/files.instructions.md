---
description: Files capability and Explorer UI architecture - platform filesystem boundary, files conversion helpers, Explorer state, commands, and source workflow.
applyTo: 'src/cs/platform/files/**,src/cs/workbench/services/files/**,src/cs/workbench/services/tablefile/**,src/cs/workbench/contrib/files/**'
---
# Files Capability / Explorer UI

The files domain has four layers that must stay separate:

| Layer | Owns | Must not own |
| --- | --- | --- |
| `platform/files` | URI filesystem providers, read/write/stat/watch, provider registration, browser/desktop adapters | Explorer state, raw table records, conversion, Session records |
| `workbench/services/files` | non-UI files helpers: conversion contracts, `fileConverter.ts`, raw table records/readers, desktop/browser file-service bridges | Explorer state, DOM, menus, table-model/template/plot semantics |
| `workbench/services/tablefile` | URI-backed table file working-copy lifecycle, format policy, and encoding helpers | Explorer UI, Table preview state, table-model inference, Recipe/Review/Slice decisions, explicit import ledger commits |
| `workbench/contrib/files` | Files feature UI: `IExplorerService`, Explorer model/view, source workflow, commands/actions/context menus | CSV/TSV/XLS/XLSX parsing internals, platform provider contracts, canonical Session ownership |

`Explorer` is the UI-state layer inside Files. Its service contract belongs
under `workbench/contrib/files`, following upstream VS Code shape.

## Target Shape

```txt
platform/files/IFileService
  low-level filesystem capability

workbench/services/files/fileConverter.ts
  CSV/TSV/XLS/XLSX/clipboard/manual -> FileConversionResult / RawTableRecord

workbench/services/tablefile/common/tableFileFormat.ts
  table import format policy for CSV/TSV/XLS/XLSX resources

workbench/services/tablefile/TableFileEditorModel
  URI/resource -> file working-copy open/cache/reload/save/sourceVersion lifecycle

workbench/contrib/files/IExplorerService
  resource tree, selection, expansion, tree/thumbnail layout

workbench/contrib/files/IExplorerWorkflowService
  view-local source/import/open/close/delete workflow dispatch
```

Do not introduce `IFileViewService`, `IFilesExplorerService`, or
`IFileImportService` by default. Choose file location by responsibility, not by
the closest-looking name.

## Terminology

| Term | Meaning | Owner |
| --- | --- | --- |
| file transfer / upload / download | moving bytes/resources | `contrib/files/browser/fileImportExport.ts` and platform file APIs |
| source collection | dialog/drop/folder/clipboard/manual -> supported table file sources | Explorer workflow/helpers plus table format policy |
| table editor support check | URI/file-name support checks before opening a table editor/preview or before read/parse where possible; `.csv`/`.tsv`/`.xls`/`.xlsx` are table formats, not URI schemes, read encodings, or languageIds | `services/tablefile/common/tableFileFormat.ts`, command/editor/model resolver |
| table editor/model lifecycle | service-local URI/input model for open, preview, cache, reload, watch, save, and source-version state | `services/tablefile` working-copy owner plus table model resolver; no resource record and not Session |
| file conversion | parse sources into raw file/table records | `services/files/browser/fileConverter.ts` |
| conversion result | converter output ready for Explorer-local rows and table resource open | `PreparedFileImport` / `PreparedFileImportEntry` |
| Explorer local import | explicit user import that updates Explorer-visible rows and opens a table resource without Session | `ExplorerViewPane` |
| table model | raw tables -> structure/profile/semantic/block model | table-model producer (`ITableModelProducerService`) |

Use user-facing "Import" in labels if appropriate, but use precise internal
names: collect sources, convert files, prepare imported files, open table resources, upload,
download, copy, close from Explorer, or delete from disk.

## Platform Boundary

`IFileService` is filesystem capability only. It owns provider registration,
`exists`, `readDir`, `readFile`, `writeFile`, `deleteFile`,
`moveFileToTrash`, `realpath`, `stat`, `watch`, and provider change events.

`IFileService` does not own Explorer tree state, selected resource, CSV/Excel
parsing, raw table records, table model, or Session records.

Forbidden dependency:

```txt
platform/files -> workbench/**
```

## Ownership

Explorer owns:

- Files container Explorer view host;
- resource tree, selection, optional raw-table `sourceKey`, expansion, layout (`tree` / `thumbnail`), focus/edit state;
- file/folder commands, actions, context menus, drag/drop UI;
- hover triggers, timing, anchors, context-view containers, positioning, dismissal;
- thumbnail candidate filtering before thumbnail UI renders;
- source workflow orchestration, Explorer-local imported rows, and optional UI follow-up after table resource opens.

Files conversion helpers own:

- source metadata and bytes/path inputs from Explorer workflow code;
- decode validation and CSV/TSV/XLS/XLSX/clipboard/manual parsing;
- one `RawTableRecord` per CSV table or Excel sheet;
- decode/parse health metadata without normalizing bad rows as valid table rows;
- normalized CSV artifact references;
- `FileConversionResult` and conversion diagnostics.

They do not own platform providers, measurement detection, template apply, plot
generation, Session mutation, or DOM rendering.

Explorer import workflows must not infer semantic badges during source
collection or conversion. Pending source rows may show only pending, preparing,
or failed UI state until the file is prepared and downstream Review/Slice
projections arrive through their owning services.

## Core Files

| File | Responsibility |
| --- | --- |
| `contrib/files/browser/files.ts` | `IExplorerService`, `IExplorerWorkflowService`, view/context contracts. |
| `contrib/files/browser/explorerService.ts` | Explorer state/model, selection/reveal, layout, expansion, pane input events. |
| `contrib/files/browser/explorerWorkflowService.ts` | Dispatches view-local source/close/delete workflows registered by `ExplorerViewPane`. |
| `contrib/files/common/explorerModel.ts` | Explorer resources/items/tree helpers. |
| `contrib/files/common/explorerFileNestingTrie.ts` | Explorer display-only file nesting pattern matching. |
| `contrib/files/browser/explorerViewlet.ts` | Explorer `ViewPane` host and sidebar actions. |
| `contrib/files/browser/views/explorerView.ts` | Explorer DOM shell/drag-drop host. |
| `contrib/files/browser/views/explorerViewer.ts` | Tree/thumbnail renderer, row templates, context menus, Explorer-owned hover containers. |
| `contrib/files/browser/fileActions.ts` / `fileCommands.ts` | Files/Explorer action and command handlers. |
| `contrib/files/browser/fileActions.contribution.ts` | Command/action/menu/keybinding registration. |
| `contrib/files/browser/fileImportExport.ts` | File transfer and source collection helpers. |
| `services/files/common/files.ts` | Source/conversion contracts. |
| `services/files/common/rawTable.ts` | Raw table records and range refs. |
| `services/files/browser/fileConverter.ts` | Source conversion into Session-ready raw models. |
| `services/files/electron-browser/fileConversionService.ts` | Desktop conversion service branch behind files service contract. |
| `services/tablefile/common/tablefiles.ts` | `ITableFileService` contract for URI-backed table file working-copy lifecycle; not a converted import ledger. |
| `services/tablefile/common/tableFileFormat.ts` | Table import format policy and resource/name support checks consumed by source collection and tablefile resolve. |
| `services/table/common/parsers.ts` | Table-owned CSV/TSV/XLSX physical table structure parser for URI-backed `ITableModel` content/sheet snapshots. |
| `services/tablefile/browser/browserTableFileService.ts` | Browser DI registration for the URI-backed table file service. |
| `services/tablefile/browser/tableFileService.ts` | URI-backed file resolve service for table resources; owns read encoding choice before delegating to the editor model manager. |
| `services/tablefile/common/encoding.ts` | Table file read encoding and base64/utf8 byte helpers for URI-backed opens. |
| `services/tablefile/common/tableFileEditorModel.ts` | URI-backed table file working-copy and associated ITableModel lifecycle. |
| `services/tablefile/common/tableFileEditorModelManager.ts` | File-backed table working-copy cache/reuse/reload/remove owner. |
| `platform/files/common/files.ts` / `fileService.ts` | Filesystem service contract and provider dispatch. |

`FileSourceWorkflow` is a private Explorer view helper, not a service boundary.
It may collect sources, watch imported folders, call conversion helpers, and
return prepared imports to the caller. It must not own Session records or
subscribe to table/template/table-model state.

## Format Boundary

Files and Explorer may filter sources with `TableFileFormatService.canHandle`.
That check is table format policy: CSV/TSV/XLS/XLSX support belongs to
`services/tablefile/common/tableFileFormat.ts`. Do not model those extensions as
URI schemes, text editor language ids, or separate encoding identities.

`services/tablefile/common/encoding.ts` only chooses the read mode after a table
format is known, such as `utf8` for delimited text and `base64` for Excel bytes.
`.txt` is not accepted as a table source unless `TableFileFormatService` is
changed to give it explicit table semantics.

## Resource/Open Workflow

Use the upstream file -> editor shape for table resources:

```txt
Explorer/drop/dialog/folder URI
  -> command/editor/model resolver
  -> ITableModelService.canHandleResource(resource) / TableFileFormatService policy
  -> editor/model owns URI, format, load state, preview rows, cache/reload/watch
  -> table/editor/explorer views read the model or service state
```

This lifecycle is service-local. Do not introduce `TableResourceRecord`,
`TableResourceImporter`, or any table-resource ledger for it. Do not write
resource/editor models, preview rows, watch/reload state, cache entries, or
active view input to Session.

## Explorer Import/Open Workflow

```txt
Explorer drop/dialog/clipboard/folder
  -> command/editor/source workflow support check
  -> source collection / pending Explorer entries
  -> fileConverter.ts
  -> PreparedFileImport rows
  -> ExplorerViewPane updates Explorer-local visible state
  -> ITableService.open({ resource })
  -> TableFileEditorModel / ITableModel own URI-backed preview lifecycle
```

This workflow does not create Session raw-table records. Passing a URI through a
support check, preparing it for Explorer display, selecting it, or opening it
for preview is not a Session commit. Session raw-table commits remain a
migration ledger for domains that still explicitly own Session records; they are
not the ordinary Explorer file-to-table path.

Per-file template selection is a Files command surface but not Files state:

```txt
Explorer context menu / template picker
  -> files.item.setTemplate command
  -> ISliceService.setTemplateSelection(fileId, selection)
  -> SliceState.templateSelectionsByFileId
  -> WorkbenchDomainBridge projects selection into Explorer pane input
```

Explorer template-menu labels are view projection, not Bridge state. Explorer
reads `IUserTemplateService` snapshots for labels and `ISliceService` selection
projection from pane input; it does not read Template editor draft state.

Slice progress/readiness is likewise projected, not owned, by Explorer:

```txt
ISliceService.onDidChangeSliceState
  -> WorkbenchDomainBridge rereads SliceState
  -> ExplorerPaneInput chartState/chartMessage
  -> Explorer view renders status
```

Explorer item close/delete keeps row lifecycle and filesystem lifecycle
separate:

```txt
Explorer item close button
  -> files.item.close command
  -> IExplorerWorkflowService.closeFile(fileId)
  -> ExplorerViewPane removes the row from Explorer-owned visible state

Explorer item context menu Delete
  -> files.item.delete command
  -> IExplorerWorkflowService.deleteFile(fileId)
  -> IDialogService confirms move to trash
  -> IFileService.moveFileToTrash(...)
  -> ExplorerViewPane removes the row from Explorer-owned visible state after success
```

Pending source entries are display-only Explorer rows. They must not be
committed to Session, selected as real files, used for duplicate detection, or
participate in file actions. When conversion commits the real file, Explorer
replaces the pending projection.

## Explorer View Rules

Explorer view code may:

- render tree/list/thumbnail resources;
- own DOM container, drag/drop handlers, row templates, context menus, and hover shell;
- receive Explorer pane input as props;
- narrow thumbnail files from Explorer view-model input;
- call commands, `IExplorerService`, or `IExplorerWorkflowService` for user intent.

Explorer view code must not parse files, read raw table rows directly, call the
table-model producer (`ITableModelProducerService`), mutate Session,
build plot models, or clear global thumbnail bitmap cache on ordinary prop
changes.

Tree and thumbnail are two presentations over the same Explorer resource model.
They must share selection, file item actions, context menus, and source
workflow wiring. Thumbnail rendering details live in `thumbnail.instructions.md`.
When a table file has multiple table entries, Explorer selection keeps `fileId`
for file actions and may carry `sourceKey` to identify the exact visible table
source. Explorer-local imports open table resources directly through
`ITableService.open({ resource })`; `WorkbenchDomainBridge` may still project
Session-backed rows to table resources when a Session raw record has a
`raw.filePath`. File close/delete/template actions still operate on `fileId`.

Explorer badge projection details live in `explorer-badge.instructions.md`.

## Command Entry

Use the upstream registration split:

```txt
fileActions.contribution.ts
  -> registers commands/actions/menus/keybindings
fileActions.ts / fileCommands.ts
  -> validates args and delegates
IExplorerService
  -> Explorer state
IExplorerWorkflowService
  -> view-local source/removal workflows
services/files helpers
  -> non-UI file work
ITableService
  -> table resource open for Explorer-local imports
```

Rules:

- `files.contribution.ts` registers the Files feature; do not make it a giant command bucket.
- Browser commands live in `contrib/files/browser/fileActions.ts` / `fileCommands.ts`.
- Desktop native helpers live in `contrib/files/electron-browser/*`.
- Add-data commands call `IExplorerWorkflowService` when the actual picker/drop/folder workflow is view-local.
- Selection/reveal uses `IExplorerService.select(...)` and `IExplorerView.selectResource(...)`.
- Rename starts editable state through `IExplorerService.setEditable(...)`; Explorer view state owns display-name overrides for visible rows.
- File-template selection delegates to `ISliceService.setTemplateSelection(...)`; Explorer owns the command surface, Slice owns the selection state and execution.
- Slice file progress/readiness comes from `SliceState.fileStates`; Explorer must use it as the sole progress/readiness source.
- Do not reach `ExplorerViewPane` through `IViewsService.getViewWithId(...)`.
- Do not publish `onDidRequest*` events from `IExplorerService` as hidden commands.

## Field Catalog

Use `records.instructions.md` for:

- `FileConversionResult`, `ImportedFileRecord`, `RawRecord`;
- `RawTableRecord`, `RawTableSourceRecord`, `RawTableRowsRecord`;
- `ExplorerState`, `ExplorerResource`, `ExplorerFileEntry`;
- `SliceFileState`.

`ExplorerSourceState` is the preferred target name for source workflow state.
Existing migration code may still call it `ExplorerImportState`.

## Naming

Use:

```txt
ExplorerService
ExplorerWorkflowService
ExplorerViewPane / ExplorerView / ExplorerViewer
explorerViewlet.ts
fileActions.ts / fileCommands.ts / fileActions.contribution.ts
fileImportExport.ts
fileConverter.ts / fileConverter.worker.ts
FileConversionResult
RawTableRecord
```

Avoid:

```txt
IFileImportService
IFileViewService
IFilesExplorerService
filesPane.ts / filesPaneHost.ts / filesController.ts
explorerPaneInput.ts / explorerPaneViewInput.ts / explorerFileOptions.ts
ExplorerImportController / ExplorerSourceController
ExplorerTreeModel / ExplorerSelectionStore
ImportManager
```

## Performance Validation

Import, badge, thumbnail, file-switch, and template-apply performance changes
should be verified with `test:template-apply-performance-trace`.

Run desktop and browser at 200 files minimum when touching import prepare,
badge projection, thumbnail hover/grid, plot cache retention, or file-switch
behavior. Use `--profile=mixed` for health/failure paths and the 260
chart-target cache-lifecycle scenario for plot display cache eviction.

Trace-only globals may expose chart target APIs for the runner. Do not use
those APIs as product command surfaces.

## Do Not

- Do not put `curveType`, axis role, template need, table-model confidence, or review confidence in conversion results.
- Do not generate measurement blocks, plot series, or template outputs in files conversion.
- Do not commit Session from `fileConverter.ts`.
- Do not let Explorer view code parse XLS/XLSX or raw rows.
- Do not let Session read files from disk.
- Do not expose Explorer UI state from `IFileService`.
- Do not put source collection/conversion semantics into `platform/files`.
- Do not create thumbnail-specific duplicates of Explorer file item commands.
- Do not move thumbnail bitmap/cache rendering into Explorer/files.
- Do not add thumbnail visibility/filter helpers under `workbench/services/thumbnail`.
