---
description: Files capability and Explorer UI architecture - platform filesystem boundary, Explorer state, commands, and source workflow.
applyTo: 'src/cs/platform/files/**,src/cs/workbench/services/tableFile/**,src/cs/workbench/contrib/files/**'
---
# Files Capability / Explorer UI

The files domain has four layers that must stay separate:

| Layer | Owns | Must not own |
| --- | --- | --- |
| `platform/files` | URI filesystem providers, read/write/stat/watch, provider registration, browser/desktop adapters | Explorer state, raw table records, source preparation, Session records |
| `workbench/services/tableFile` | URI-backed table file working-copy lifecycle, reader, and table text/byte helpers for file-backed models | Explorer UI, Table view state, preview projection, table-model inference, DataResource/Review/Slice decisions, explicit import ledger commits |
| `workbench/contrib/files` | Files feature UI: `IExplorerService`, Explorer model/view, source workflow, commands/actions/context menus | CSV/TSV/XLS/XLSX parsing internals, platform provider contracts, canonical Session ownership |

`Explorer` is the UI-state layer inside Files. Its service contract belongs
under `workbench/contrib/files`, following upstream VS Code shape.

## Target Shape

```txt
platform/files/IFileService
  low-level filesystem capability

workbench/contrib/files/browser/fileImportExport.ts
  dialog/drop/folder/clipboard/manual -> resource-backed ExplorerFileEntry rows

workbench/services/table/common/tableFormatService.ts
  table import format policy for CSV/TSV/XLS/XLSX resources

workbench/services/tableFile/TableFileEditorModel
  URI/resource -> file working-copy open/cache/reload/save/sourceVersion lifecycle

workbench/contrib/files/IExplorerService
  resource tree, selection, expansion, tree/thumbnail layout

workbench/contrib/files/ExplorerViewPane
  view-local source/import/open/close/delete workflow host reached by commands through IViewsService.openView(...)
```

Do not introduce `IFileViewService`, `IFilesExplorerService`, or
`IFileImportService` by default. Choose file location by responsibility, not by
the closest-looking name.

## Terminology

| Term | Meaning | Owner |
| --- | --- | --- |
| file transfer / upload / download | moving bytes/resources | `contrib/files/browser/fileImportExport.ts` and platform file APIs |
| source collection | dialog/drop/folder/clipboard/manual -> supported table file sources | Explorer workflow/helpers plus table format policy |
| table editor support check | URI/file-name support checks before opening a table editor/preview or before read/parse where possible; `.csv`/`.tsv`/`.xls`/`.xlsx` are table formats, not URI schemes, read encodings, or languageIds | `services/table/common/tableFormatService.ts`, command/editor/model resolver |
| table editor/model lifecycle | service-local URI/input model for open, preview, cache, reload, watch, save, and source-version state | `services/tableFile` working-copy owner plus table model resolver; no resource record and not Session |
| source preparation result | Explorer-local row metadata, table resource URI, and diagnostics before table resource open | `ExplorerFileEntry` |
| Explorer local import | explicit user import that updates Explorer-visible rows and opens a table resource without Session | `ExplorerViewPane` |

Use user-facing "Import" in labels if appropriate, but use precise internal
names: collect sources, prepare imported files, open table resources, upload,
download, copy, close from Explorer, or delete from disk.

## Platform Boundary

`IFileService` is filesystem capability only. It owns provider registration,
`exists`, `readDir`, `readFile`, `writeFile`, `deleteFile`,
`moveFileToTrash`, `realpath`, `stat`, `watch`, and provider change events.
Desktop file IPC must rely on base IPC byte marshalling so `IFileContent.value`
leaves `platform/files` as a real `Uint8Array`.
The JSON marshalling helper for this belongs in `src/cs/base/common/marshalling.ts`;
Files/TableFile code must not duplicate desktop byte revival.

`IFileService` does not own Explorer tree state, selected resource, CSV/Excel
parsing, raw table records, table model, or Session records.

Forbidden dependency:

```txt
platform/files -> workbench/**
```

## Ownership

Explorer owns:

- Files container Explorer view host;
- resource tree, URI/sheet selection, visible-row source identity, expansion, layout (`tree` / `thumbnail`), focus/edit state;
- file/folder commands, actions, context menus, drag/drop UI;
- hover triggers, timing, anchors, context-view containers, positioning, dismissal;
- thumbnail candidate filtering before thumbnail UI renders;
- source workflow orchestration, `IExplorerService.files` imported rows, resource/sheet state projection, and optional UI follow-up after table resource opens.

## Resource / Sheet Identity

Upstream VS Code Explorer identity is URI-based. Conductor keeps that boundary:
filesystem, editor/model, `ITableService.open({ resource })`, and URI identity
services use `resource: URI` only.

Explorer row identity is the direct value
`{ resource: URI, sheetId?: string | null }`. Use it only where a visible
Explorer row, Review/Slice resource, hover, selection, visible target, or
file-item command needs sheet precision. `ExplorerResourceIdentity` is a
Conductor Files/Explorer value, not an upstream VS Code interface, and must not
be used to replace global URI semantics.

Do not encode `sheetId` into a URI for Explorer row identity, commands, service
calls, table open, file operations, or editor/model identity. Do not add
`ExplorerResourceTarget`, `ExplorerSourceTarget`, nested
`{ target: { resource, sheetId } }`, aliases, or compatibility wrappers around
this shape. Migrate call sites to direct `resource` and optional `sheetId`
fields.

The only permitted sheet-in-URI boundary is for URI-only decoration APIs. Files
or Table decoration providers may derive a private decoration resource URI so
the decorations service can address a sheet row, but they must parse that URI
back to `{ resource, sheetId? }` immediately inside the provider. This adapter
must not be used as a command, service, Explorer row, file operation, or editor
identity, and should be deleted when the decorations service supports structured
resource/sheet decoration keys.

Row-level Explorer operations that can distinguish two sheet rows for the same
URI, such as select, hover, close, delete, rename, template selection, visible
targets, Review, Slice, Plot, and Chart resource handoff, carry
`{ resource, sheetId? }`. File-level side effects such as open-table-resource,
trash/delete-on-disk, and reveal-in-OS first resolve the exact Explorer row when
needed, then pass only `identity.resource` to the file/editor owner.

Explorer source workflow owns:

- source metadata and bytes/path inputs from dialog/drop/folder/clipboard/manual entry points;
- browser `File` provider registration when a dropped source has no durable resource URI;
- resource-backed `ExplorerFileEntry` rows, resource URIs, and source diagnostics.

Migration-ledger raw-table records are Session contracts, and migration-ledger
raw-row reading is a Slice execution detail. Files/Explorer does not own raw
table records, row readers, measurement detection, template apply, plot
generation, Session mutation, or DOM rendering outside its own views.

Explorer import workflows must not infer semantic badges during source
collection or source preparation. Pending source rows may show only pending, preparing,
or failed UI state until the file has a resolved resource and downstream Review/Slice
state arrives through their owning services.

## Core Files

| File | Responsibility |
| --- | --- |
| `contrib/files/browser/files.ts` | `IExplorerService`, view/context contracts. |
| `contrib/files/browser/explorerService.ts` | Explorer state/model, committed file rows, selection/reveal, layout, expansion, pane input events. |
| `contrib/files/common/explorerModel.ts` | Explorer resources/items/tree helpers. |
| `contrib/files/common/explorerFileNestingTrie.ts` | Explorer display-only file nesting pattern matching. |
| `contrib/files/browser/explorerViewlet.ts` | Explorer `ViewPane` host and sidebar actions. |
| `contrib/files/browser/views/explorerView.ts` | Explorer DOM shell/drag-drop host. |
| `contrib/files/browser/views/explorerViewer.ts` | Tree/thumbnail renderer, row templates, context menus, Explorer-owned hover containers. |
| `contrib/files/browser/fileActions.ts` / `fileCommands.ts` | Files/Explorer action and command handlers. |
| `contrib/files/browser/fileActions.contribution.ts` | Command/action/menu/keybinding registration. |
| `contrib/files/browser/fileImportExport.ts` | File transfer and source collection helpers. |
| `contrib/files/browser/workspaceWatcher.ts` | Explorer folder import watcher for detecting external changes to the currently imported folder. |
| `services/tableFile/common/tablefiles.ts` | `ITableFileService` contract for URI-backed table file working-copy lifecycle; not a raw-table import ledger. |
| `services/table/common/tableFormatRegistry.ts` | Known table format IDs, materialization capability, and default extension metadata. |
| `services/table/common/tableFormatAssociations.ts` | Resource/name/extension association helpers for table format resolution. |
| `services/table/common/tableFormatService.ts` | Table import format policy and resource/name support checks consumed by source collection and tableFile resolve for CSV/TSV/XLS/XLSX resources. |
| `services/table/common/tableReadBuffer.ts` | Table-owned text/byte read buffer contracts consumed by parsers. |
| `services/table/common/tableStructureParser.ts` | Table-owned CSV/TSV/XLS/XLSX physical table structure parser for URI-backed `ITableModel` content/sheet snapshots, including legacy HTML/SpreadsheetML `.xls`; binary BIFF/OLE `.xls` requires the desktop native `.xls` sheet-row reader or returns a clear unsupported diagnostic. |
| `services/tableFile/common/tableFileReader.ts` | URI-backed table file reader; reads platform bytes, selects table text/byte mode after format resolution, and returns `TableReadBuffer`. |
| `services/tableFile/browser/browserTableFileService.ts` | Browser DI registration for the URI-backed table file service. |
| `services/tableFile/browser/tableFileService.ts` | URI-backed file resolve service for table resources; owns table read mode choice before delegating to the editor model manager. |
| `services/tableFile/electron-browser/nativeTableFileService.ts` | Desktop DI registration for the URI-backed table file service; supplies TS native BIFF/OLE `.xls` sheet-row reading only for `.xls` resolves. |
| `services/tableFile/common/encoding.ts` | Table file text/byte mode, byte conversion, and mime helpers for URI-backed opens. |
| `services/tableFile/common/tableFileEditorModel.ts` | URI-backed table file working-copy and associated ITableModel lifecycle. |
| `services/tableFile/common/tableFileEditorModelManager.ts` | File-backed table working-copy cache/reuse/reload/remove owner. |
| `platform/files/common/files.ts` / `fileService.ts` | Filesystem service contract and provider dispatch. |

`FileSourceWorkflow` is a private Explorer view helper, not a service boundary.
It may collect sources, watch imported folders, prepare resource-backed rows, and
return Explorer rows to the caller. It must not own Session records or
subscribe to table/template/table-model state.

## Format Boundary

Files and Explorer may filter sources with `TableFormatService.canHandle`.
That check is table format policy: CSV/TSV/XLS/XLSX support belongs to
`services/table/common/tableFormatService.ts`. Do not model those extensions as
URI schemes, text editor language ids, or separate encoding identities.

`services/tableFile/common/encoding.ts` only chooses the table decode mode after a table
format is known, such as text for delimited content and bytes for Excel content.
`.txt` is not accepted as a table source unless `TableFormatService` is
changed to give it explicit table semantics.

## Resource/Open Workflow

Use the upstream file -> editor shape for table resources:

```txt
Explorer/drop/dialog/folder URI
  -> command/editor/model resolver
  -> ITableModelService.canHandleResource(resource) / TableFormatService policy
  -> editor/model owns URI, format, load state, cache/reload/watch; preview rows are a service/view projection
  -> table/editor/explorer views read the model or service state
```

This lifecycle is service-local. Do not introduce `TableResourceRecord`,
`TableResourceImporter`, or any table-resource ledger for it. Do not write
resource/editor models, preview projections, watch/reload state, cache entries, or
active view input to Session.

## Explorer Import/Open Workflow

```txt
Explorer drop/dialog/clipboard/folder
  -> command/editor/source workflow support check
  -> source collection / pending Explorer entries
  -> assign table resource URI / register browser File with file provider when needed
  -> resource-backed ExplorerFileEntry rows
  -> ExplorerViewPane commits rows through IExplorerService file-model APIs
  -> ExplorerViewPane ensures IReviewService.resolveReviewSummary({ resource, sheetId? }) runs for resolved resource/sheet rows, even when no Explorer row is added
  -> ITableService.open({ resource })
  -> TableFileEditorModel / ITableModel own URI-backed model lifecycle
```

For folder source replacement, Explorer may publish pending/resource-backed rows in
batches, but it defers the table-resource open until the replacement completes.
That keeps the Explorer tree update ahead of table model resolution, matching
the upstream Explorer-then-editor ordering.

This workflow does not create Session raw-table records. Passing a URI through a
support check, preparing it for Explorer display, selecting it, or opening it
for preview is not a Session commit. Session raw-table commits remain a
migration ledger for domains that still explicitly own Session records; they are
not the ordinary Explorer file-to-table path.

Per-resource template selection is a Files command surface but not Files state:

```txt
Explorer context menu / template picker
  -> files.item.setTemplate command
  -> ISliceService.setTemplateSelection(resource, sheetId, selection)
  -> SliceState.templateSelections
  -> WorkbenchDomainBridge projects selection into Explorer pane input
```

Explorer template-menu labels are view projection, not Bridge state. Explorer
reads `IUserTemplateService` snapshots for labels and `ISliceService` selection
projection from pane input; it does not read Template editor draft state.

Slice progress/readiness is likewise read from the Slice owner, not owned, by Explorer:

```txt
ISliceService.onDidChangeSliceState / onDidChangeResourceSliceResult({ resource, sheetId? })
  -> Slice subscribers reread the Slice owner for the affected { resource, sheetId? }
  -> ExplorerViewPane / PlotService / Thumbnail paths update their own render state/cache
```

`ExplorerPaneInput` must not carry Slice resource state, chart data flags, or a
second resource list. Commands, Quick Access, decorations, and cross-domain
bridges read `IExplorerService.files` when they need the authoritative Explorer
row set. Slice state/result belongs to `ISliceService`; subscribers receive
Slice events and reread `getResourceState(resource, sheetId)` or
`getResourceResult(resource, sheetId)` when their own UI or cache needs it.
Explorer selection, hover, and visible-row notifications carry resource
identity directly as `{ resource, sheetId? }`; do not add public
`ExplorerResourceTarget` wrappers or nested `{ target: ... }` event payloads
for this chain.

Chart thumbnail membership follows Slice-owned URI/sheet state, not Explorer
row state and not plot result materialization. A resource/sheet row is visible
in chart thumbnail mode when Slice reports `queued`, `processing`, or `ready`,
or when `ISliceService.getResourceResult(resource, sheetId)` returns a result.
`hasChartData` only means downstream Slice/Plot data is already materialized and
can render as ready; it must not be the only gate because that would hide valid
Slice work while it is still queued or processing. Files/Explorer must not add a
separate `hasSliceCandidate` field or candidate list to preserve this.

Explorer item close/delete keeps row lifecycle and filesystem lifecycle
separate:

```txt
Explorer item close button
  -> files.item.close command
  -> IViewsService.openView(ExplorerViewId)
  -> ExplorerViewPane.closeFile({ resource, sheetId })
  -> ExplorerViewPane removes the row from Explorer-owned visible state

Explorer item context menu Delete
  -> files.item.delete command
  -> IViewsService.openView(ExplorerViewId)
  -> ExplorerViewPane.deleteFile({ resource, sheetId })
  -> IDialogService confirms move to trash
  -> IFileService.moveFileToTrash(...)
  -> ExplorerViewPane removes the row from Explorer-owned visible state after success
```

Pending source entries are display-only Explorer rows. They must not be
committed to Session, selected as real files, used for duplicate detection, or
participate in file actions. When source preparation resolves the real file,
Explorer replaces the pending projection and explicitly asks Review to evaluate
the resolved `{ resource, sheetId? }` identity; Explorer still does not infer semantic badges during
source collection or preparation.

Review input changes for already-visible Explorer rows are likewise projected
through Review, not inferred in Files:

```txt
IUserTemplateService.onDidChangeUserTemplates / ISettingsService.onDidChangeConductorSettings
  -> ExplorerViewPane.reviewExplorerEntries(current files)
  -> IReviewService.resolveReviewSummary({ resource, sheetId? })
  -> IReviewService.onDidChangeReview
  -> ExplorerViewPane syncs ReviewSummary and decoration props
```

## Explorer View Rules

Explorer view code may:

- render tree/list/thumbnail resources;
- own DOM container, drag/drop handlers, row templates, context menus, and hover shell;
- receive Explorer pane input as props;
- narrow thumbnail files by reading Slice owner state/result for each resource row;
- call commands or `IExplorerService` for user intent.

Explorer view code must not parse files, read raw table rows directly, call the
review pipeline, mutate Session,
build plot models, or clear global thumbnail bitmap cache on ordinary prop
changes.

Tree and thumbnail are two presentations over the same Explorer resource model.
They must share selection, file item actions, context menus, and source
workflow wiring. Thumbnail rendering details live in `thumbnail.instructions.md`.
When a table file has multiple table entries, Explorer selection uses the table
resource plus `sheetId` for the exact visible row. Explorer-local imports open
table resources directly through `ITableService.open({ resource })`.
Migration-ledger raw rows that still carry `sourcePath` are projected into
Explorer resource rows before Table opens them; `WorkbenchDomainBridge` must
not derive table resources directly from Session raw records. File
close/delete/reveal commands operate on `{ resource, sheetId }`; the template
command delegates the current `resource` and optional `sheetId` directly to
`ISliceService.setTemplateSelection(...)`.

Explorer decoration details live in `explorer-decorations.instructions.md`.

## Command Entry

Use the upstream registration split:

```txt
fileActions.contribution.ts
  -> registers commands/actions/menus/keybindings
fileActions.ts / fileCommands.ts
  -> validates args and delegates to the owner or opens ExplorerViewPane for view-local workflows
IExplorerService
  -> Explorer state
IViewsService.openView(ExplorerViewId)
  -> upstream-style access to ExplorerViewPane for view-local source/removal workflows
Explorer/source helpers
  -> non-UI source collection work inside contrib/files
ITableService
  -> table resource open for Explorer-local imports
```

Rules:

- `files.contribution.ts` registers the Files feature; do not make it a giant command bucket.
- Browser commands live in `contrib/files/browser/fileActions.ts` / `fileCommands.ts`.
- Desktop native helpers live in `contrib/files/electron-browser/*`.
- Add-data commands call `IViewsService.openView(ExplorerViewId)` when the actual picker/drop/folder workflow is view-local.
- Selection/reveal uses `IExplorerService.select(...)` and `IExplorerView.selectResource(...)`.
- Rename starts editable state through `IExplorerService.setEditable(...)`; Explorer view state owns display-name overrides for visible rows.
- File-template selection delegates to `ISliceService.setTemplateSelection(resource, sheetId, selection)`; Explorer owns the command surface, Slice owns the selection state and execution.
- Slice progress/readiness comes from `ISliceService.getResourceState(resource, sheetId)`; Explorer must use it as the sole progress/readiness source.
- Do not reach `ExplorerViewPane` through `IViewsService.getViewWithId(...)`.
- Do not publish `onDidRequest*` events from `IExplorerService` as hidden commands.

`ExplorerSourceState` is the preferred target name for source workflow state.
Existing migration code may still call it `ExplorerImportState`.

## Naming

Use:

```txt
ExplorerService
ExplorerViewPane / ExplorerView / ExplorerViewer
explorerViewlet.ts
fileActions.ts / fileCommands.ts / fileActions.contribution.ts
fileImportExport.ts
FileImportResult
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
decoration display, thumbnail hover/grid, plot cache retention, or file-switch
behavior. Use `--profile=mixed` for health/failure paths and the 260
chart-target cache-lifecycle scenario for plot display cache eviction.

Trace-only globals may expose chart target APIs for the runner. Do not use
those APIs as product command surfaces.

## Do Not

- Do not put `curveType`, axis role, template need, table-model confidence, or review confidence in source preparation/import results.
- Do not generate measurement blocks, plot series, or template outputs in files source preparation.
- Do not commit Session from Explorer source preparation.
- Do not let Explorer view code parse XLS/XLSX or raw rows.
- Do not let Session read files from disk.
- Do not expose Explorer UI state from `IFileService`.
- Do not put source collection/source preparation semantics into `platform/files`.
- Do not create thumbnail-specific duplicates of Explorer file item commands.
- Do not move thumbnail bitmap/cache rendering into Explorer/files.
- Do not add thumbnail visibility/filter helpers under `workbench/services/thumbnail`.
