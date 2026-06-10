---
description: Files capability and Explorer UI architecture - platform file system boundary, files workbench capability, Explorer view state, file/folder commands, CSV/XLS/XLSX/clipboard conversion, raw table records, and import/export workflow boundaries.
applyTo: 'src/cs/platform/files/**,src/cs/workbench/services/files/**,src/cs/workbench/services/explorer/**,src/cs/workbench/contrib/files/**,src/cs/workbench/services/analysisFile/browser/{fileConversion.ts,xlsxConversionWorker.ts,filePreviewService.ts,importPipeline.ts}'
---
# Files Capability / Explorer UI

The `files` domain is a capability and feature area. It includes platform filesystem access, file-oriented workbench services, file import/conversion workflows, file commands, and the sidebar Files container.

`Explorer` is the UI layer inside that files area. It is the primary view hosted by the Files container and owns resource-tree interaction state such as selection, expansion, focus/editing, and tree/thumbnail layout.

This follows the upstream VS Code shape: `contrib/files` is the feature area; `ExplorerView`, `ExplorerViewer`, and `IExplorerService` are the UI/view-state vocabulary inside it; `IFileService` remains the lower-layer filesystem capability.

## Target Shape

```txt
platform/files/IFileService
  low-level filesystem capability

workbench/services/files
  workbench file capability and desktop/browser file-service bridges

workbench/services/files/fileConverter.ts
  Conductor import conversion: CSV/XLS/XLSX/clipboard -> FileImportResult / RawTableRecord payloads

workbench/services/explorer/IExplorerService
  Explorer UI state inside the Files container: resource tree, selection, expansion, tree/thumbnail layout, import orchestration

workbench/contrib/files
  Files container, Explorer view host, commands, actions, and UI workflow
```

Do not introduce `IFileViewService` or `IFilesExplorerService`. The view-state service is `IExplorerService`. Do not introduce `IFileImportService` by default; keep import conversion as focused files-domain modules under `workbench/services/files`.

## Platform File System Boundary

`IFileService` is a platform service. It represents filesystem capability, not Explorer UI state and not the analysis import pipeline.

The Explorer UI and files import workflows may depend on `IFileService`, but platform filesystem capability stays separate from Explorer state and files import conversion.

`IFileService` owns:

- provider registration by URI scheme;
- `exists`, `readDir`, `readFile`, `writeFile`, `realpath`, `stat`, `watch`;
- file change events from providers;
- filesystem abstractions that work across browser and desktop.

It does not own:

- Explorer tree state;
- selected file/resource;
- CSV/Excel parsing;
- raw table records;
- assessment;
- session commits.

Platform files dependency rules:

```txt
Allowed:
  platform/files -> base
  platform/files/electron-browser -> platform ipc abstractions

Forbidden:
  platform/files -> workbench/services/session
  platform/files -> workbench/services/explorer
  platform/files -> workbench/services/files
  platform/files -> workbench/contrib/*
```

`IFileService` returns filesystem facts. `IExplorerService` decides how those facts become Explorer resources. `fileConverter.ts` decides how import payloads become raw table records.

## Ownership

Explorer UI owns:

- the Files container's Explorer view host;
- Explorer resource tree state;
- selected Explorer resource;
- expanded/collapsed folder keys;
- tree vs thumbnail layout mode;
- file/folder commands and context menu dispatch;
- drag/drop/dialog/clipboard import orchestration;
- coordinating files import/export workflows and committing successful import results through `ISessionService`.

Files capability and import/conversion modules own:

- reading import source metadata supplied by Explorer workflow code;
- converting CSV, XLS, XLSX, clipboard, or manual inputs into raw table facts;
- generating one `RawTableRecord` per CSV table or Excel sheet;
- writing or referencing normalized CSV artifacts;
- returning import diagnostics;
- producing `FileImportResult` for `ISessionService.commitFileImport(...)`.

It does not own:

- platform filesystem providers;
- IV/CV/CF/PV/IT detection;
- measurement block detection;
- template application;
- plot/chart generation;
- session mutation from conversion modules;
- DOM rendering from service modules.

## Recommended Files

| File | Responsibility | Inputs | Outputs | Must not do |
| --- | --- | --- | --- | --- |
| `src/cs/workbench/services/explorer/common/explorer.ts` | Defines `IExplorerService`, Explorer state, selection, layout mode, service events, and command-facing methods. | None; type-only. | Explorer UI-state service contract. | Define filesystem provider contracts or raw conversion records. |
| `src/cs/workbench/services/explorer/browser/explorerService.ts` | Owns Explorer UI state, subscribes to session/template/plot changes, emits Explorer events, orchestrates import workflows. | Session snapshots/events, commands, import inputs. | Explorer pane input, selection/layout events, session import commits. | Render DOM, parse CSV/XLS/XLSX, or own canonical session records. |
| `src/cs/workbench/contrib/files/browser/filesPaneHost.ts` | Hosts Explorer inside the Files container and wires sidebar actions. | Explorer services and pane input. | Rendered files sidebar pane. | Own canonical data or bypass `IExplorerService` for state. |
| `src/cs/workbench/contrib/files/browser/views/explorerViewer.ts` | Renders tree/list/thumbnail resources, context menus, row templates, and hover content. | Explorer pane/view model. | DOM presentation and user intents. | Parse files, mutate session directly, or build canonical plot data. |
| `src/cs/platform/files/common/files.ts` | Defines `IFileService`, `IFileSystemProvider`, `FileType`, file stat/read/write/watch contracts, and the service decorator. | URI/provider inputs. | Filesystem facts and provider events. | Import workbench services, parse data files, or own UI/import state. |
| `src/cs/platform/files/common/io.ts` | Defines common read range and stream/range option types. | None; type-only. | Platform IO contracts. | Import DOM, Electron, or workbench modules. |
| `src/cs/platform/files/browser/webFileSystemAccess.ts` | Browser File System Access API adapter and folder import capability detection. | Browser file handles/resources. | File/folder capability facts. | Know about session, Explorer model, or raw table records. |
| `src/cs/platform/files/browser/htmlFileSystemProvider.ts` | Browser-side provider implementation for web-accessible file handles. | Web file handles. | Provider contract implementation. | Own Explorer UI state or import semantics. |
| `src/cs/platform/files/electron-browser/fileService.ts` | Renderer-side desktop file service bridge. | IPC/filesystem requests. | Desktop file facts. | Add analysis import semantics. |
| `src/cs/platform/files/electron-main/*` | Main-process provider implementation when desktop local filesystem access is required. | Native filesystem requests. | Provider responses. | Import workbench services or mutate session. |
| `src/cs/workbench/services/files/common/rawTable.ts` | Defines raw table records: `RangeRef`, `RawTableRangeRef`, `RawTableRecord`, `RawTableRowsRecord`, `RawTableSourceRecord`. | None; type-only. | Shared raw table types. | Import browser APIs, parse files, or define assessment fields. |
| `src/cs/workbench/services/files/common/files.ts` | Defines files-import data contracts: `FileImportInput`, `FileImportResult`, `FileImportDiagnostic`, source kinds. | None; type-only. | Import/conversion contracts. | Define `IFileImportService` unless a stable service boundary is intentionally added later. |
| `src/cs/workbench/services/files/browser/fileConverter.ts` | Converts CSV/XLS/XLSX/clipboard/manual sources into `FileImportResult`. | `FileImportInput`, source bytes/path metadata, optional converter worker. | `FileImportResult`, `RawTableRecord`, normalized CSV refs, diagnostics. | Call `IAssessmentService`, commit session, touch Explorer state, or render preview. |
| `src/cs/workbench/services/files/browser/fileConverter.worker.ts` | Optional worker for expensive workbook conversion. | Workbook bytes / file reference. | Per-sheet raw table payloads or normalized CSV artifact refs. | Own UI state or session state. |
| `src/cs/workbench/contrib/files/browser/fileImportExport.ts` | Files workflow helpers: folder walking, source collection, external upload/download scenario utilities. | `IFileService`, URI/file sources, folder resources. | `FileSource[]`, read failures, download/upload side effects. | Become a generic import service or parse assessment semantics. |
| `src/cs/workbench/services/analysisFile/browser/importPipeline.ts` | Migration-only. Retire after Explorer import controller + `fileConverter.ts` exist. | Legacy pending import objects. | Legacy prepared file info. | Continue to grow. |
| `src/cs/workbench/services/analysisFile/browser/fileConversion.ts` | Migration-only. Move conversion into `services/files/browser/fileConverter.ts`. | Legacy file/path metadata. | Legacy prepared browser file. | Call `assessImportFile` in the target architecture. |
| `src/cs/workbench/services/analysisFile/browser/xlsxConversionWorker.ts` | Migration-only worker. Fold into `fileConverter.worker.ts` if still needed. | XLS/XLSX file. | CSV/raw table payload. | Know about session, Explorer, template, or assessment. |
| `src/cs/workbench/services/analysisFile/browser/filePreviewService.ts` | Re-evaluate. Raw preview likely belongs to `ITableService`; keep only if it becomes a narrow raw row reader. | Raw table refs / normalized CSV refs. | Preview rows. | Become a second TableService or AnalysisFileService. |

## Import Workflow

```mermaid
flowchart TD
    UI[Explorer drop/dialog/clipboard] --> ExplorerController[Explorer import workflow]
    ExplorerController --> FileImportExport[fileImportExport.ts]
    ExplorerController --> Converter[fileConverter.ts]
    Converter --> RawTables[FileImportResult + RawTableRecord[]]
    ExplorerController --> Session[ISessionService.commitFileImport]
    Session --> Event[rawTablesChanged]
    Event --> Assessment[IAssessmentService]
```

Explorer controls the user-facing workflow. `fileImportExport.ts` collects sources. `fileConverter.ts` converts. Session commits. Assessment interprets structure later.

Workbench commands that need filesystem access should call a workbench service or controller, and that service/controller may depend on `IFileService`.

```txt
Explorer import folder command
  -> IExplorerService / ExplorerImportController
  -> IFileDialogService + IFileService
  -> fileConverter.ts / files import-export workflow
  -> ISessionService.commitFileImport
```

## Explorer View Rules

Explorer view code should:

- own DOM container and drag/drop handlers;
- forward user intent to `IExplorerService` or commands;
- receive Explorer view input as props;
- not parse files;
- not call `IAssessmentService`;
- not mutate session records.

`ExplorerViewer` should:

- render object tree rows and thumbnails;
- manage row templates and context menu presentation;
- call commands or service methods for user actions;
- not read raw table rows directly;
- not build plot models directly.

Thumbnail mode is an Explorer layout mode, not a `FilterViewPane`. Filtering or narrowing thumbnail inputs is Explorer business logic unless a shared view-level filter widget is intentionally introduced.

## Explorer Command Entry and Dispatch

Explorer commands are user-facing entry points for the resource tree.

Recommended files:

| File | Responsibility |
| --- | --- |
| `src/cs/workbench/contrib/files/browser/explorerCommands.ts` | Target file name for Explorer command handlers. During migration, current `fileCommands.ts` may hold these handlers. |
| `src/cs/workbench/contrib/files/browser/explorerActions.ts` | Toolbar, context menu, menu, and keybinding entries that execute Explorer commands. |
| `src/cs/workbench/contrib/files/browser/explorer.contribution.ts` | Imports/registers Explorer commands/actions and view contribution. |
| `src/cs/workbench/contrib/files/browser/explorerImportController.ts` | Optional controller for dialog/drop import workflows, progress, notification, and batching. |

Command handlers should delegate to `IExplorerService`:

```ts
handler: async (accessor, rawSource) => {
  const explorer = accessor.get(IExplorerService);
  await explorer.importResources(normalizeExplorerImportSource(rawSource));
}
```

Explorer commands should not call `FilesPaneHost` methods after migration. If a command currently reaches a view through `IViewsService.getViewWithId(...)`, treat it as a temporary compatibility bridge and move the behavior into `IExplorerService`.

Typical command ownership:

| Command | Owner | Service call |
| --- | --- | --- |
| import folder/files/drop | Explorer | `IExplorerService.importResources(...)`, internally using file import/export + fileConverter |
| remove imported file/resource | Explorer | `IExplorerService.removeResources(...)` |
| select resource | Explorer | `IExplorerService.setSelection(...)` |
| toggle tree/thumbnail layout | Explorer | `IExplorerService.setLayout(...)` |
| set file template selection | Explorer + Template | `IExplorerService.setResourceTemplateSelection(...)` or `ITemplateService.setSelectionForFile(...)` |

## Type Contracts

### `FileImportInput`

| Field | Meaning |
| --- | --- |
| `sources` | Files, paths, clipboard payloads, or manual table payloads to convert. |
| `importedAt` | Timestamp for diagnostics and replay/debug. |
| `options` | Conversion options such as normalized CSV preference or max inline size. |

### `FileImportResult`

| Field | Meaning |
| --- | --- |
| `files` | File records containing raw table facts. |
| `diagnostics` | Import/conversion warnings and errors. |
| `createdAt` | Creation timestamp for debugging/import chronology. |

### `RawRecord`

| Field | Meaning |
| --- | --- |
| `fileId` | Parent file/workbook id. |
| `fileName` | Source/display name. |
| `rawFile` | Optional opaque browser/native file handle. |
| `size` | Source byte size. |
| `lastModified` | Source modified timestamp. |
| `relativePath` | Folder import path used by Explorer grouping. |
| `filePath` | Native path when available. |
| `rawTablesById` | Raw tables produced from this file. |
| `rawTableOrder` | Stable sheet/table order. |

### `RawTableRecord`

| Field | Meaning |
| --- | --- |
| `fileId` | Parent file id. |
| `rawTableId` | Raw table/sheet id. |
| `source` | CSV/sheet/clipboard/manual source metadata. |
| `rows` | Inline rows or normalized CSV storage reference. |
| `rowCount` | Physical raw table row count. |
| `columnCount` | Physical raw table column count. |
| `maxCellLengths` | Display hint for table column widths. |

### `RawTableRowsRecord`

| Variant | Fields | Meaning |
| --- | --- | --- |
| `inline` | `values` | Rows stored directly in memory/session. |
| `normalizedCsv` | `normalizedCsvPath`, `formatVersion` | Rows stored in an internal normalized CSV artifact. |

### `ExplorerState`

| Field | Meaning |
| --- | --- |
| `layout` | `tree` or `thumbnail` display mode. |
| `selectedFileId` | Currently selected file in Explorer. |
| `expandedFolderKeys` | Expanded tree folders. |
| `folderOrder` | Optional user/imported folder ordering. |
| `importState` | Current import workflow state. |
| `error` | User-visible Explorer import error. |
| `dragging` | Whether files are being dragged over Explorer. |

### `ExplorerImportState`

| Variant | Meaning |
| --- | --- |
| `idle` | No active import. |
| `picking` | Open dialog is active. |
| `collecting` | Folder/drop sources are being collected. |
| `importing` | Files are being converted to raw tables. |
| `committing` | Import result is being committed to session. |
| `failed` | Workflow failed with message/diagnostics. |

### `ExplorerResource`

| Field | Meaning |
| --- | --- |
| `kind` | `folder`, `file`, `rawTable`, or `measurementBlock`. |
| `key` | Stable tree key. |
| `fileId` | File id for file/table/block resources. |
| `rawTableId` | Raw table id for table/block resources. |
| `measurementBlockId` | Measurement block id for block resources. |
| `name` | Display name. |
| `parentKey` | Parent tree key. |
| `children` | Child resources. |
| `diagnosticBadge` | Optional import/assessment badge. |
| `thumbnailModelId` | Optional thumbnail reference. |

## Component Split

Use these components instead of nested managers:

| Component | Responsibility |
| --- | --- |
| `ExplorerService` | Owns Explorer state, exposes selection/layout/import state events. |
| `ExplorerImportController` | Coordinates dialogs/drop/folder import, calls files import/export helpers + `fileConverter.ts`, then commits through `ISessionService`. |
| `ExplorerTreeModel` | Builds `ExplorerResource[]` from session snapshot and explorer state. |
| `ExplorerSelectionStore` | Optional local selection/focus state helper. |
| `ExplorerView` | DOM shell for drag/drop and view hosting. |
| `ExplorerViewer` | Tree/thumbnail renderer. |

Do not create `ExplorerManager` that owns `ImportManager`, `SelectionManager`, and `ThumbnailManager`. Those are separate responsibilities with different lifetimes.

## Naming Rules

Use `files` for capabilities and the feature/container area. Use `Explorer` for the UI layer, resource tree, view state, and user interaction. Use `fileConverter` for conversion-specific modules.

Good names:

```txt
ExplorerView
ExplorerViewer
ExplorerImportController
FilesPaneHost
fileImportExport.ts
fileConverter.ts
fileConverter.worker.ts
FileImportResult
RawTableRecord
```

Avoid:

```txt
IFileImportService
IFileViewService
IFilesExplorerService
ImportManager
FileViewImport
AnalysisFileImportPipeline
```

## Do Not

- Do not put `curveType`, `xAxisRole`, `needsTemplate`, or assessment confidence in import result.
- Do not generate measurement blocks here.
- Do not create plot series here.
- Do not commit session from `fileConverter.ts`.
- Do not let Explorer view code parse XLS/XLSX.
- Do not let Session read files from disk.
- Do not put Explorer or import semantics into `platform/files` command handlers.
- Do not expose Explorer UI state from `IFileService`.
