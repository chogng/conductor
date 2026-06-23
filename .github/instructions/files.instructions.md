---
description: Files capability and Explorer UI architecture - platform filesystem boundary, files conversion helpers, Explorer state, commands, and source workflow.
applyTo: 'src/cs/platform/files/**,src/cs/workbench/services/files/**,src/cs/workbench/contrib/files/**'
---
# Files Capability / Explorer UI

The files domain has three layers that must stay separate:

| Layer | Owns | Must not own |
| --- | --- | --- |
| `platform/files` | URI filesystem providers, read/write/stat/watch, provider registration, browser/desktop adapters | Explorer state, raw table records, conversion, Session commits |
| `workbench/services/files` | non-UI files helpers: conversion contracts, `fileConverter.ts`, raw table records/readers, desktop/browser file-service bridges | Explorer state, DOM, menus, assessment/template/plot semantics |
| `workbench/contrib/files` | Files feature UI: `IExplorerService`, Explorer model/view, source workflow, commands/actions/context menus | CSV/XLS/XLSX parsing internals, platform provider contracts, canonical Session ownership |

`Explorer` is the UI-state layer inside Files. Its service contract belongs
under `workbench/contrib/files`, following upstream VS Code shape.

## Target Shape

```txt
platform/files/IFileService
  low-level filesystem capability

workbench/services/files/fileConverter.ts
  CSV/XLS/XLSX/clipboard/manual -> FileConversionResult / RawTableRecord

workbench/contrib/files/IExplorerService
  resource tree, selection, expansion, tree/thumbnail layout

workbench/contrib/files/IExplorerWorkflowService
  view-local source/close/delete workflow dispatch
```

Do not introduce `IFileViewService`, `IFilesExplorerService`, or
`IFileImportService` by default. Choose file location by responsibility, not by
the closest-looking name.

## Terminology

| Term | Meaning | Owner |
| --- | --- | --- |
| file transfer / upload / download | moving bytes/resources | `contrib/files/browser/fileImportExport.ts` and platform file APIs |
| source collection | dialog/drop/folder/clipboard/manual -> file sources | Explorer workflow/helpers |
| file conversion | parse sources into raw file/table records | `services/files/browser/fileConverter.ts` |
| conversion result | converter output ready for Session | `FileConversionResult` |
| session commit | canonical import storage | `ISessionService.commitFileImport(...)` |
| assessment | raw tables -> measurement semantics | `IAssessmentService` |

Use user-facing "Import" in labels if appropriate, but use precise internal
names: collect sources, convert files, commit converted files, upload,
download, copy, close from Explorer, or delete from disk.

## Platform Boundary

`IFileService` is filesystem capability only. It owns provider registration,
`exists`, `readDir`, `readFile`, `writeFile`, `deleteFile`,
`moveFileToTrash`, `realpath`, `stat`, `watch`, and provider change events.

`IFileService` does not own Explorer tree state, selected resource, CSV/Excel
parsing, raw table records, assessment, or Session commits.

Forbidden dependency:

```txt
platform/files -> workbench/**
```

## Ownership

Explorer owns:

- Files container Explorer view host;
- resource tree, selection, expansion, layout (`tree` / `thumbnail`), focus/edit state;
- file/folder commands, actions, context menus, drag/drop UI;
- hover triggers, timing, anchors, context-view containers, positioning, dismissal;
- thumbnail candidate filtering before thumbnail UI renders;
- source workflow orchestration and optional UI follow-up after Session commits.

Files conversion helpers own:

- source metadata and bytes/path inputs from Explorer workflow code;
- decode validation and CSV/XLS/XLSX/clipboard/manual parsing;
- one `RawTableRecord` per CSV table or Excel sheet;
- decode/parse health metadata without normalizing bad rows as valid table rows;
- normalized CSV artifact references;
- `FileConversionResult` and conversion diagnostics.

They do not own platform providers, measurement detection, template apply, plot
generation, Session mutation, or DOM rendering.

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
| `services/files/browser/fileConverter.ts` | Source conversion into session-ready raw facts. |
| `services/files/electron-browser/fileConversionService.ts` | Desktop conversion service branch behind files service contract. |
| `platform/files/common/files.ts` / `fileService.ts` | Filesystem service contract and provider dispatch. |

`FileSourceWorkflow` is a private Explorer view helper, not a service boundary.
It may collect sources, watch imported folders, call conversion helpers, and
return prepared imports to the caller. It must not own Session records or
subscribe to table/template/assessment state.

## Data Workflow

```txt
Explorer drop/dialog/clipboard/folder
  -> source collection / pending Explorer entries
  -> fileConverter.ts
  -> FileConversionResult
  -> fileImportExport.ts optional prepared assessment seed from converted row preview
  -> ISessionService.commitFileImport(...)
  -> SessionChangeEvent subscribers
  -> Explorer resources / Table / Assessment / Template / Plot / Search / Export
```

Slice with template follows the same ownership split:

```txt
Explorer context menu
  -> files.item.sliceWithTemplate command
  -> IExplorerWorkflowService.sliceFileWithTemplate(fileId)
  -> SliceWithTemplateController modal
  -> IFileService read/write/delete actual files
  -> FileSourceWorkflow.importGeneratedFiles(...)
  -> fileConverter.ts
  -> ISessionService.commitFileImport(...)
  -> Explorer resources / downstream subscribers
```

Per-file template selection is a Files command surface but not Files state:

```txt
Explorer context menu / template picker
  -> files.item.setTemplate command
  -> ISliceService.setTemplateSelection(fileId, selection)
  -> SliceState.templateSelectionsByFileId
  -> WorkbenchDomainBridge projects selection into Explorer pane input
```

The Explorer current-template menu display is view projection, not Bridge
state:

```txt
ITemplateViewStateService.onDidChangeTemplateState / ITemplateService.onDidChangeTemplates
  -> ExplorerViewPane rereads TemplateViewStateService + TemplateService
  -> Explorer view props currentTemplateLabel/currentTemplateSelection
```

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
  -> ExplorerViewPane removes the imported row from Explorer/Session

Explorer item context menu Delete
  -> files.item.delete command
  -> IExplorerWorkflowService.deleteFile(fileId)
  -> IDialogService confirms move to trash
  -> IFileService.moveFileToTrash(...)
  -> ExplorerViewPane removes the imported row from Explorer/Session after success
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

Explorer view code must not parse files, read raw table rows directly, call
`IAssessmentService`, mutate Session, build plot models, or clear global
thumbnail bitmap cache on ordinary prop changes.

Tree and thumbnail are two presentations over the same Explorer resource model.
They must share selection, file item actions, context menus, and source
workflow wiring. Thumbnail rendering details live in `thumbnail.instructions.md`.

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
```

Rules:

- `files.contribution.ts` registers the Files feature; do not make it a giant command bucket.
- Browser commands live in `contrib/files/browser/fileActions.ts` / `fileCommands.ts`.
- Desktop native helpers live in `contrib/files/electron-browser/*`.
- Add-data commands call `IExplorerWorkflowService` when the actual picker/drop/folder workflow is view-local.
- Selection/reveal uses `IExplorerService.select(...)` and `IExplorerView.selectResource(...)`.
- Rename starts editable state through `IExplorerService.setEditable(...)`; committed display-name metadata belongs to Session.
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

- Do not put `curveType`, axis role, template need, or assessment confidence in conversion results.
- Do not generate measurement blocks, plot series, or template outputs in files conversion.
- Do not commit Session from `fileConverter.ts`.
- Do not let Explorer view code parse XLS/XLSX or raw rows.
- Do not let Session read files from disk.
- Do not expose Explorer UI state from `IFileService`.
- Do not put source collection/conversion semantics into `platform/files`.
- Do not create thumbnail-specific duplicates of Explorer file item commands.
- Do not move thumbnail bitmap/cache rendering into Explorer/files.
- Do not add thumbnail visibility/filter helpers under `workbench/services/thumbnail`.
