---
description: Files capability and Explorer UI architecture - platform file system boundary, files workbench capability, Explorer view state, file/folder commands, source collection, CSV/XLS/XLSX/clipboard conversion, raw table records, and file transfer boundaries.
applyTo: 'src/cs/platform/files/**,src/cs/workbench/services/files/**,src/cs/workbench/contrib/files/**'
---
# Files Capability / Explorer UI

The `files` domain spans three layers that must stay separate during migration: `platform/files`, `workbench/services/files`, and `workbench/contrib/files`.

`Explorer` is the UI-state layer inside the files feature area. It is the primary view hosted by the Files container and owns resource-tree interaction state such as selection, expansion, focus/editing, and tree/thumbnail layout. Following upstream, its service contract and implementation belong under `workbench/contrib/files`, not `workbench/services/files`.

This follows the upstream VS Code shape: `platform/files` is the low-level filesystem capability; `workbench/services/files` is the workbench files service layer for filesystem bridges/helpers such as elevated/disk/watcher support; `workbench/contrib/files` is the Files feature contribution, Explorer service, and UI area. `ExplorerView`, `ExplorerViewer`, and `IExplorerService` are the UI/view-state vocabulary inside Files; `IFileService` remains the lower-layer filesystem capability.

## Target Shape

```txt
platform/files/IFileService
  low-level filesystem capability

workbench/services/files
  workbench files service layer: desktop/browser file-service bridges, source/conversion contracts, raw table row access, focused conversion helpers

workbench/services/files/fileConverter.ts
  Conductor import conversion: CSV/XLS/XLSX/clipboard -> FileConversionResult / RawTableRecord payloads

workbench/contrib/files/IExplorerService
  Explorer UI state inside the Files container: resource tree, selection, expansion, tree/thumbnail layout, source collection/conversion workflow orchestration

workbench/contrib/files/common/explorerModel.ts
  Explorer resource/item model and tree helpers shared by Explorer service and views

workbench/contrib/files
  Files container, Explorer service, Explorer model/view host, commands, actions, and UI workflow
```

Do not introduce `IFileViewService` or `IFilesExplorerService`. The view-state service is `IExplorerService`, and it belongs to `workbench/contrib/files` like upstream. Do not introduce `IFileImportService` by default; keep file conversion as focused files-domain modules under `workbench/services/files`.

The legacy `workbench/services/explorer/**` location has been retired. Explorer service code should use `workbench/contrib/files/**`; conversion/raw-table helpers should use `workbench/services/files/**`.

Entry-point registration should preserve this distinction. Import
`contrib/files/browser/explorerService` from a `workbench contrib services`
region when the browser workbench needs to run the Explorer DI registration.
Do not place that import under a `workbench services` region, and do not move
Explorer code into `workbench/services/files` just to make the entry-point
section look homogeneous.

## Layer Boundaries

Use these three locations for different responsibilities:

| Layer | Owns | May depend on | Must not own |
| --- | --- | --- | --- |
| `src/cs/platform/files` | URI-based filesystem providers, file stats, read/write/watch, provider registration, browser/desktop filesystem adapters. | `base`, platform IPC abstractions. | Explorer state, raw table records, file conversion, session commits, workbench views. |
| `src/cs/workbench/services/files` | Workbench files service helpers: desktop/browser file-service bridges, elevated/disk/watcher support, source/conversion contracts, `fileConverter.ts`, raw table records/readers. | `platform/files`, focused conversion helpers, type-only session contracts when needed for commit payload shape. | Explorer state, DOM rendering, command/menu registration, Files pane layout, platform provider implementation, assessment/template/plot semantics. |
| `src/cs/workbench/contrib/files` | Files feature contribution: Files container, `IExplorerService`, Explorer model/state, Explorer view host, views, commands, actions, context menus, drag/drop UI, source workflow controller. | `workbench/services/files`, `platform/files` through services/controllers, workbench UI services. | Canonical session records beyond invoking commits, CSV/XLS/XLSX parsing, raw table storage, low-level filesystem provider contracts. |

Migration rule: when upstream has code under `workbench/services/files`, map file-service bridges and reusable file capability helpers there. When upstream has code under `workbench/contrib/files`, map Explorer service, Explorer model, views, commands, actions, and contribution code there. When upstream has code under `platform/files`, keep it platform-only and do not let it learn Conductor source workflow or conversion semantics.

When Conductor has a file that does not exist upstream, choose the destination by responsibility, not by the closest-looking name:

| Put it under | If the file primarily... | Examples |
| --- | --- | --- |
| `workbench/contrib/files` | owns Explorer/UI state, commands, actions, view models, drag/drop UI, dialogs, progress, notifications, context menus, or source workflow orchestration. | Explorer source controller, Files pane host, resource tree model, command handlers, file transfer UI helpers. |
| `workbench/services/files` | provides reusable non-UI files-domain contracts or helpers: conversion contracts, raw table records/readers, normalized CSV references, file conversion workers, renderer-side file-service bridge helpers. | `fileConverter.ts`, `fileConverter.worker.ts`, `rawTable.ts`, raw row readers, source/conversion type contracts. |
| `platform/files` | implements generic URI filesystem capability with no workbench, Explorer, session, raw table, or Conductor data semantics. | provider contracts, provider registration, read/write/stat/watch dispatch, browser file handle provider, main-process disk provider server. |

Decision tests:

- If it imports DOM, view panes, menus, actions, notifications, progress UI, dialogs, or commands, it belongs in `contrib/files`.
- If it imports `IExplorerService`, `ExplorerItem`, `ExplorerResource`, or owns selection/layout/expanded state, it belongs in `contrib/files`.
- If it parses CSV/XLS/XLSX/clipboard/manual rows or produces `FileConversionResult`/`RawTableRecord`, it belongs in `services/files`.
- If it only defines types shared by conversion and session commit payloads, it belongs in `services/files/common`.
- If it can be reused by any workbench feature without knowing Explorer or raw tables, it may belong in `workbench/services/files`.
- If it needs to know `ISessionService`, keep that dependency in `contrib/files` orchestration where possible; conversion modules should return results, not commit.
- If it needs to know only URI/filesystem providers and byte/stat/watch operations, it belongs in `platform/files`.
- If it would make `platform/files` import anything from `workbench`, it is in the wrong layer.

## Import Terminology

Be careful with the word `import`. Upstream VS Code uses `fileImportExport.ts` for file transfer workflows in `contrib/files`: browser upload, external file drop/copy into the workspace, and download. In that upstream context, `ExternalFileImport.import(...)` means "copy dropped external resources into an Explorer target", not "parse file contents into domain records".

In Conductor, keep the user-facing word `Import` for commands and labels when the user is adding data files, but use more precise internal vocabulary:

| Term | Meaning | Preferred location |
| --- | --- | --- |
| file transfer / upload / download | Moving bytes between external files, browser handles, workspace resources, and local downloads. | `workbench/contrib/files/browser/fileImportExport.ts` or workbench helpers that call platform file APIs. |
| source collection | Turning drop/dialog/folder/clipboard/manual input into `FileSource[]`. | Explorer workflow or focused files helpers. |
| file conversion | Parsing CSV/XLS/XLSX/clipboard/manual sources into raw file/table records. | `workbench/services/files/browser/fileConverter.ts`. |
| conversion result | Converter output that can be committed to session. | `FileConversionResult`. |
| session commit | Storing converted raw files/tables in canonical session state. | `ISessionService.commitFileImport(...)` or its future renamed equivalent. |
| assessment | Interpreting raw tables into measurement blocks and semantic roles. | `IAssessmentService`. |

Do not use a generic `ImportService` or `IFileImportService` unless a stable boundary is intentionally introduced. Most code should say what it actually does: collect sources, convert files, commit converted files, upload files, download files, or copy external resources.

## Platform File System Boundary

`IFileService` is a platform service. It represents filesystem capability, not Explorer UI state and not the analysis import pipeline.

The Explorer UI and data-file source collection workflows may depend on `IFileService`, but platform filesystem capability stays separate from Explorer state and file conversion.

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
  platform/files/electron-main -> platform ipc abstractions

Forbidden:
  platform/files -> workbench/services/session
  platform/files -> workbench/services/files
  platform/files -> workbench/contrib/*
```

`workbench/services/explorer` is retired. Do not introduce new dependencies on it; Explorer service code belongs under `workbench/contrib/files`.

`IFileService` returns filesystem facts. `IExplorerService` decides how those facts become Explorer resources. `fileConverter.ts` decides how collected data sources become raw table records.

## Ownership

Explorer UI owns:

- the Files container's Explorer view host;
- Explorer resource tree state;
- selected Explorer resource;
- expanded/collapsed folder keys;
- both Explorer presentation layouts: `tree` and `thumbnail`;
- tree vs thumbnail layout mode;
- the Explorer more actionbar placement for switching layouts;
- tree item hover triggers, hover timing, anchors, context-view containers, positioning, and dismissal;
- thumbnail file visibility/filtering before thumbnail UI is rendered;
- file/folder commands and context menu dispatch;
- drag/drop/dialog/clipboard source collection orchestration;
- coordinating source collection, file conversion, file transfer helpers, and committing successful conversion results through `ISessionService`.

Explorer consumes thumbnail UI for thumbnail layout cards and tree-layout hover previews. Thumbnail content is rendered by `src/cs/workbench/contrib/thumbnail`; Explorer owns the trigger, container, selection, file item actions, file visibility filtering, and lifecycle.

Files service conversion modules own:

- reading source metadata supplied by Explorer workflow code;
- converting CSV, XLS, XLSX, clipboard, or manual inputs into raw table facts;
- generating one `RawTableRecord` per CSV table or Excel sheet;
- accepting backend `sheets` metadata when a converter can emit multiple worksheet CSV payloads;
- writing or referencing normalized CSV artifacts;
- returning conversion diagnostics;
- producing `FileConversionResult` for `ISessionService.commitFileImport(...)`.

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
| `src/cs/workbench/contrib/files/browser/files.ts` | Defines `IExplorerService`, `IExplorerView`, command target helpers, Explorer selection/focus service contract. | None or type-only service imports. | Explorer UI-state service contract. | Define filesystem provider contracts or raw conversion records. |
| `src/cs/workbench/contrib/files/browser/explorerService.ts` | Owns Explorer UI state/model coordination, subscribes to filesystem/session/template/plot changes as needed, emits Explorer events, orchestrates source collection/conversion workflows. | Filesystem/session snapshots/events, commands, source inputs. | Explorer pane input, selection/layout events, session conversion commits. | Render DOM, parse CSV/XLS/XLSX, or own canonical session records. |
| `src/cs/workbench/contrib/files/common/explorerModel.ts` | Defines Explorer resource/item model and tree model helpers. | File/session facts, Explorer configuration. | Explorer resources/items for the Files UI. | Parse data files, store raw table rows, or become a platform file stat model. |
| `src/cs/workbench/contrib/files/common/explorerFileNestingTrie.ts` | Implements upstream-shaped Explorer file nesting pattern matching. | Parent/child file nesting patterns and direct sibling file names. | Parent -> nested children filename map for Explorer display only. | Read session, parse files, mutate Explorer state, or decide import/conversion behavior. |
| `src/cs/workbench/contrib/files/browser/explorerViewlet.ts` | Upstream-aligned Files/Explorer viewlet entry for the Explorer pane and sidebar actions inside the generic Files container. | Explorer services and pane input. | Rendered Explorer pane. | Own canonical data or bypass `IExplorerService` for state. |
| `src/cs/workbench/contrib/files/browser/views/explorerViewer.ts` | Renders tree/list/thumbnail resources, context menus, row templates, Explorer-owned hover containers, and thumbnail UI content supplied by thumbnail contribution. | Explorer pane/view model, thumbnail UI factory/rendering surface props. | DOM presentation and user intents. | Parse files, mutate session directly, build canonical plot data, or own thumbnail bitmap/cache rendering. |
| `src/cs/platform/files/common/files.ts` | Defines `IFileService`, `IFileSystemProvider`, `FileType`, file stat/read/write/watch contracts, and the service decorator. | URI/provider inputs. | Filesystem facts and provider events. | Import workbench services, parse data files, or own Explorer/source workflow state. |
| `src/cs/platform/files/common/fileService.ts` | Implements the common `IFileService` provider registry and read/write/stat/watch dispatch. | Provider registrations and URI operations. | Filesystem facts and provider-backed file operations. | Depend on workbench services, Explorer state, or Conductor conversion/session semantics. |
| `src/cs/platform/files/common/io.ts` | Defines common read range and stream/range option types. | None; type-only. | Platform IO contracts. | Import DOM, Electron, or workbench modules. |
| `src/cs/platform/files/browser/webFileSystemAccess.ts` | Browser File System Access API adapter and browser file/folder handle capability detection. | Browser file handles/resources. | File/folder capability facts. | Know about session, Explorer model, source collection, or raw table records. |
| `src/cs/platform/files/browser/htmlFileSystemProvider.ts` | Browser-side provider implementation for web-accessible file handles. | Web file handles. | Provider contract implementation. | Own Explorer UI state or Conductor conversion semantics. |
| `src/cs/platform/files/electron-main/*` | Main-process provider/server implementation when desktop local filesystem access is required. | Native filesystem requests and IPC channels. | Provider responses. | Import workbench services or mutate session. |
| `src/cs/workbench/services/files/electron-browser/fileConverterBackendService.ts` | Desktop implementation of `IFileConverterBackendService`; calls preload/IPC/Rust or reads normalized CSV artifacts. | File path metadata, Electron IPC/preload bridge, normalized CSV paths. | Prepared conversion descriptors and converted CSV reads for `fileConverter.ts`. | Register commands/actions, own Explorer state, commit session, or expose Rust-specific UI. |
| `src/cs/workbench/services/files/electron-browser/*` | Other workbench renderer-side desktop files service bridges such as disk provider clients/watchers. | IPC/filesystem service dependencies. | Registered workbench file providers and watcher clients. | Add Explorer state, command/menu registration, or UI workflow semantics. |
| `src/cs/workbench/services/files/common/rawTable.ts` | Defines raw table records: `RangeRef`, `RawTableRangeRef`, `RawTableRecord`, `RawTableRowsRecord`, `RawTableSourceRecord`. | None; type-only. | Shared raw table types. | Import browser APIs, parse files, or define assessment fields. |
| `src/cs/workbench/services/files/common/files.ts` | Defines source/conversion data contracts: `FileImportInput`, `FileConversionResult`, `FileImportDiagnostic`, source kinds. | None; type-only. | Source/conversion contracts. | Define `IFileImportService` unless a stable service boundary is intentionally added later. |
| `src/cs/workbench/services/files/browser/fileConverter.ts` | Converts CSV/XLS/XLSX/clipboard/manual sources into session-ready raw import facts. | `FileImportInput`, source bytes/path metadata, optional converter worker. | `FileConversionResult`, `ImportedFileRecord`, `RawTableRecord`, normalized CSV refs, diagnostics. | Call `IAssessmentService`, commit session, touch Explorer state, or render preview. |
| `src/cs/workbench/services/files/browser/fileConverter.worker.ts` | Optional worker for expensive workbook conversion. | Workbook bytes / file reference. | Per-sheet raw table payloads or normalized CSV artifact refs. | Own UI state or session state. |
| `src/cs/workbench/contrib/files/browser/fileImportExport.ts` | File transfer and source collection helpers: folder picker support, folder walking, `FileSource[]` collection, pending conversion queue, external upload/download scenario utilities. | `IFileService`, URI/file sources, folder resources, `fileConverter.ts` conversion output. | `FileSource[]`, prepared imported files, read/prepare failures, download/upload side effects. | Become a generic import service, parse CSV/XLS/XLSX directly, or parse assessment semantics. |

`FileSourceWorkflow` in `fileImportExport.ts` is an Explorer view-local helper,
not a service boundary. It may collect dropped/dialog/folder sources, watch an
imported folder for external changes, call file conversion prepare helpers, and
emit prepared imports back to `ExplorerViewPane`. It must not own canonical
session records, commit session directly, subscribe to session/table/template
state, or expose itself as an injectable service.

`common/explorerFileNestingTrie.ts` is an Explorer display-model helper for
file nesting patterns: it computes parent/child visual nesting inside a
directory, such as showing related generated files under one parent file.
`explorerModel.ts` may consume it when building tree nodes from direct sibling
files. It is not part of data import, source collection, conversion, session
commit, table preview, or template application.

Current implementation note: the session/import result path supports multiple
raw tables per imported workbook when `fileConverter.ts` receives sheet
metadata. The bundled Rust and WASM Excel converters currently export the first
worksheet only, so true multi-sheet import also requires extending those
converter backends to emit one sheet descriptor per worksheet.

## Data File Workflow

```mermaid
flowchart TD
    UI[Explorer drop/dialog/clipboard] --> ExplorerController[Explorer source workflow]
    ExplorerController --> FileImportExport[fileImportExport.ts]
    ExplorerController --> Converter[fileConverter.ts]
    Converter --> RawTables["FileConversionResult + RawTableRecord[]"]
    ExplorerController --> Session[ISessionService.commitFileImport]
    Session --> Event[rawTablesChanged]
    Event --> Assessment[IAssessmentService]
```

Explorer controls the user-facing add-data workflow. `fileImportExport.ts` collects sources or handles file transfer. `fileConverter.ts` converts data sources. Session commits. Assessment interprets structure later.

Runtime chain:

```mermaid
flowchart TD
    User[User drop/dialog/clipboard/folder] --> Command[Explorer command]
    Command --> ExplorerWorkflow[IExplorerService / Files source workflow]
    ExplorerWorkflow --> SourceCollection[fileImportExport.ts source collection]
    SourceCollection --> Sources["FileSource[]"]
    ExplorerWorkflow --> Converter[fileConverter.ts]
    Sources --> Converter
    Converter --> ConversionResult[FileConversionResult]
    ConversionResult --> RawFiles[Converted file records]
    ConversionResult --> RawTables["RawTableRecord[]"]
    ConversionResult --> Diagnostics[Conversion diagnostics]
    ExplorerWorkflow --> Commit[ISessionService.commitFileImport]
    ConversionResult --> Commit
    Commit --> SessionEvents[Session raw table/file changes]
    SessionEvents --> Assessment[IAssessmentService]
    SessionEvents --> ExplorerView[Explorer tree/resources]
    SessionEvents --> Table[Table/raw preview]
    Assessment --> Plot[Plot/thumbnail/export consumers]
```

```txt
User drop/dialog/clipboard/folder
  -> Explorer command
  -> IExplorerService / Files source workflow
  -> fileImportExport.ts collects FileSource[]
  -> fileConverter.ts converts sources
  -> FileConversionResult
  -> ISessionService.commitFileImport(...)
  -> Session emits raw table/file changes
  -> IAssessmentService interprets raw tables
  -> Table / Explorer / Plot / Export consume derived state
```

Use `FileConversionResult` for the converter output. It is not the result of the whole Explorer add-data workflow; it is the session-ready raw file/table conversion result produced by `fileConverter.ts`.

Workbench commands that need filesystem access should call a workbench service or controller, and that service/controller may depend on `IFileService`.

```txt
Explorer import folder command
  -> IExplorerService / fileActions.ts or fileImportExport.ts workflow helper
  -> IFileDialogService + IFileService
  -> fileImportExport.ts source collection / fileConverter.ts conversion
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
- own tree/list hover trigger, hover timing, anchor, context-view container, positioning, and dismissal;
- call thumbnail UI factories for thumbnail card and hover-preview content;
- narrow thumbnail files from Explorer view-model inputs before rendering cards;
- clear only Explorer-owned thumbnail DOM/hover caches on prop changes;
- call commands or service methods for user actions;
- not read raw table rows directly;
- not build plot models directly.

Thumbnail mode is an Explorer layout mode, not a `FilterViewPane`. Filtering or narrowing thumbnail inputs is Explorer business logic unless a shared view-level filter widget is intentionally introduced.
Explorer view rerenders must not call `IThumbnailService.clear()` as a generic invalidation step. Thumbnail bitmap cache invalidation belongs to the thumbnail service cache key/signature logic or to an explicit thumbnail cache command.

## Explorer Tree/Thumbnail Wiring

Tree and thumbnail are two Explorer presentations over the same resource model. They must share Explorer selection, file item actions, and source workflow wiring.

Selection follows the cross-service mirroring rule from
`architecture.instructions.md`: Explorer owns Explorer selection. Other
domains may derive their own target inputs from it through the workbench
composition layer or a view bridge, but Explorer must not call another domain's
private lifecycle methods such as table preview invalidation.

Workbench composition code may project session/read-model facts into Explorer
view input and expose files-owned session callbacks such as add/remove/replace.
That projection must not live in `contrib/files` once it needs session,
template, plot, or table composition. It must not accept `TableModel`,
`TableSource`, or table preview lifecycle callbacks. Table preview state is
owned by `ITableService`.

Selection wiring:

```mermaid
sequenceDiagram
    actor User
    participant ExplorerViewer
    participant ExplorerViewPane
    participant ExplorerService as IExplorerService
    participant Workbench

    alt tree layout
        User->>ExplorerViewer: select tree file item
        ExplorerViewer->>ExplorerViewPane: onSelectFile(fileId)
    else thumbnail layout
        User->>ExplorerViewer: click thumbnail file item
        ExplorerViewer->>ExplorerViewPane: onSelectFile(fileId)
    end
    ExplorerViewPane->>ExplorerService: select({ kind, fileId, candidateFileIds }, reveal?)
    ExplorerService-->>Workbench: onDidChangeSelection({ kind, selectedFileId })
    Workbench->>ExplorerService: updatePaneInput({ selectedFileId, files, ... })
    ExplorerViewPane->>ExplorerViewer: setProps({ selectedFileId })
```

File item action wiring:

```mermaid
sequenceDiagram
    actor User
    participant ExplorerViewer
    participant CommandService as ICommandService
    participant FilesAction as existing files Action2
    participant FilesCommand as existing files command handler
    participant ExplorerFiles as Explorer/files service or workflow

    alt tree layout
        User->>ExplorerViewer: invoke file item action
    else thumbnail layout
        User->>ExplorerViewer: invoke same file item action
    end
    ExplorerViewer->>CommandService: executeCommand(existing files action id, fileId, args)
    CommandService->>FilesAction: run(accessor, fileId, args)
    FilesAction->>FilesCommand: handler(accessor, fileId, args)
    FilesCommand->>ExplorerFiles: call existing Explorer/files service or workflow API
```

Tree item hover thumbnail preview wiring:

```mermaid
sequenceDiagram
    actor User
    participant ExplorerViewer
    participant ContextViewService as IContextViewService
    participant HoverContainer as Explorer hover context-view container
    participant ThumbnailView as thumbnail UI factory
    participant ThumbnailRenderer as thumbnail rendering surface

    User->>ExplorerViewer: hover tree/list file item
    ExplorerViewer->>ExplorerViewer: resolve hover file + plot model
    ExplorerViewer->>ContextViewService: showContextView({ getAnchor, render, getWidth }, hoverHost)
    ContextViewService-->>ExplorerViewer: IOpenContextView
    ExplorerViewer->>HoverContainer: create Explorer-owned hover shell
    ExplorerViewer->>ThumbnailView: create thumbnail preview content
    ThumbnailView->>ThumbnailRenderer: render thumbnail from plot model
    User->>ExplorerViewer: leave item or hover container
    ExplorerViewer->>ContextViewService: hide/dismiss context view
```

Layout toggle wiring:

```mermaid
sequenceDiagram
    actor User
    participant ExplorerViewPane
    participant CommandService as ICommandService
    participant ThumbnailCommand as thumbnail layout toggle command
    participant ExplorerService as IExplorerService

    User->>ExplorerViewPane: click Explorer more actionbar Thumbnail
    ExplorerViewPane->>CommandService: executeCommand(TOGGLE_THUMBNAIL_VIEW_ACTION_ID)
    CommandService->>ThumbnailCommand: run handler
    ThumbnailCommand->>ExplorerService: toggleViewLayout()
    ExplorerService-->>ExplorerViewPane: onDidChangeViewLayout(viewLayout)
    ExplorerViewPane->>ExplorerViewer: render tree or thumbnail layout
```

Explorer owns the more actionbar placement and `IExplorerService.viewLayout`. The thumbnail contribution owns the thumbnail-specific toggle action/command and thumbnail UI/rendering content. Do not add duplicate Explorer file item commands for thumbnail layout.

## Explorer Command Entry and Dispatch

Explorer commands are user-facing entry points for the resource tree.

When a feature is invoked through the workbench command/action system, use the upstream registration split:

```txt
fileActions.contribution.ts
  registers CommandsRegistry / MenuRegistry / keybindings / registerAction2 entries
  -> fileActions.ts or fileCommands.ts
  -> IExplorerService
  -> workbench/services/files helpers when non-UI file work is needed
```

`files.contribution.ts` should remain the Files feature contribution entry for services, views, configuration, and workbench contributions. Do not use it as the growing command/menu registration bucket once `fileActions.contribution.ts` exists.

Recommended files:

| File | Responsibility |
| --- | --- |
| `src/cs/workbench/contrib/files/browser/fileCommands.ts` | Upstream-aligned target for Files/Explorer command handlers. Validates command args, resolves `IExplorerService`, and delegates. |
| `src/cs/workbench/contrib/files/browser/fileActions.ts` | Upstream-aligned target for actions, command helpers, context-menu behavior, and small UI workflow helpers. |
| `src/cs/workbench/contrib/files/browser/fileActions.contribution.ts` | Upstream-aligned contribution entry that imports/registers file commands/actions. |
| `src/cs/workbench/contrib/files/electron-browser/fileCommands.ts` | Desktop-only Files command helpers such as reveal in OS. Follows upstream native split. |
| `src/cs/workbench/contrib/files/electron-browser/fileActions.contribution.ts` | Desktop-only command/menu/action registration for native Files actions. If `workbench.desktop.main.ts` imports this file, it must actually register the desktop command/action; do not leave only exported constants or detached handlers. Do not put Rust conversion branching here. |
| `src/cs/workbench/contrib/files/browser/fileImportExport.ts` | Upstream-aligned target for external file transfer plus Conductor source collection helpers. Use this for dialog/drop/folder source collection helpers instead of creating a generic import controller. |

Empty folders are Explorer presentation state only when backed by imported file
paths. Do not create placeholder session records for empty folders; if a folder
contains no supported raw table files, it should not appear as canonical session
data.

Do not split thin files out of `fileImportExport.ts` just to name internal
steps such as pending import queues, folder-import dialogs, or folder-import
types. Those are source workflow details owned by `contrib/files`. In
particular, do not reintroduce `pendingImportFiles.ts`,
`folderImportDialog.ts`, or `folderImport.ts` unless a new reusable boundary is
proven by non-Explorer callers.

Do not split thin files out of `fileConverter.ts` just to wrap raw import record
creation. Normalized CSV/worksheet payloads becoming `ImportedFileRecord` and
`RawTableRecord` is part of conversion output shaping. Keep the trivial
`FileImportResult` wrapper in `services/files/common/files.ts`; keep raw table
row reading in `rawTableRowsReader` because table/assessment consumers use that
boundary after session commit.

Do not reintroduce `filesPane.ts` or `filesPaneHost.ts` as separate thin
wrappers. Upstream's corresponding file is `explorerViewlet.ts`; keep the
Explorer `ViewPane` host and sidebar action wiring there while the workbench
continues to use the generic `ViewPaneContainer` for the Files container. The
actual Explorer rendering stays in `views/explorerView.ts` /
`views/explorerViewer.ts`. Do not add a separate `filesController.ts` migration
adapter for Explorer props, service subscriptions, or source workflow callbacks.
Those responsibilities belong to `ExplorerViewPane` and `ExplorerView`, matching
the upstream Explorer shape: the ViewPane listens to `IExplorerService`,
subscribes to Explorer/session-derived pane input, and consumes it to update the
Explorer view. `ExplorerViewPane` may instantiate `FileSourceWorkflow` as a
private view helper, but that helper must remain callback-based and view-local.
Do not put cross-service table/template/assessment lifecycle ownership in
Explorer view code.

Do not reintroduce `explorerPaneInput.ts`, `explorerPaneViewInput.ts`, or
`explorerFileOptions.ts` under `contrib/files`. Explorer pane input is an
Explorer service payload type on `browser/files.ts`; Workbench-only projection
from session, template, plot, and processing state belongs in the Workbench
composition layer, preferably as local `workbench.ts` composition methods rather
than a parallel Workbench Explorer pane helper file. Chart file
options belong to chart common code, not Explorer/files.

Command handlers should use the actual upstream-shaped `IExplorerService` surface when the behavior is Explorer view/model state:

```ts
handler: async (accessor, resource) => {
  const explorer = accessor.get(IExplorerService);
  await explorer.select(resource, 'force');
}
```

For Conductor-specific add-data workflows, define the command/action in `fileActions.ts` / `fileActions.contribution.ts`, then delegate to a precisely named source-collection/conversion workflow. Do not document placeholder methods such as `importResources(...)` as if they were upstream Explorer APIs.

Explorer commands should not call `ExplorerViewPane` methods after migration. If a command currently reaches a view through `IViewsService.getViewWithId(...)`, treat it as a temporary compatibility bridge and move the behavior into `IExplorerService`.

Upstream command shape:

- command/action/menu/keybinding registration lives in `fileActions.contribution.ts`;
- command handlers and action implementations live in `fileActions.ts` / `fileCommands.ts`;
- desktop-only native actions such as reveal-in-OS live in
  `contrib/files/electron-browser/fileActions.contribution.ts` and
  `contrib/files/electron-browser/fileCommands.ts`, matching upstream's native
  split;
- `IExplorerService` exposes Explorer context and view/model operations such as `getContext(...)`, `select(...)`, `setEditable(...)`, `setToCopy(...)`, `applyBulkEdit(...)`, `refresh(...)`, and `registerView(...)`;
- create/rename/delete/copy/paste style operations are actions/handlers that use Explorer context plus file/bulk-edit services, not `IExplorerService.removeResources(...)`;
- upload/download use `fileImportExport.ts` helpers such as `BrowserFileUpload` and `FileDownload`.

Conductor-specific commands should follow the upstream registration and handler shape without pretending that upstream has the same API:

- Add-data commands belong in `fileActions.ts` / `fileActions.contribution.ts`. They may call source collection helpers in `fileImportExport.ts`, conversion in `fileConverter.ts`, and session commit APIs. Name any new helper after the concrete workflow, not after a generic import service.
- Resource removal commands should be action/handler code that derives Explorer context and calls the appropriate session or file operation. Add an `IExplorerService` method only when the operation mutates Explorer view/model state rather than canonical session/file state.
- Select/reveal behavior should use the upstream-shaped `IExplorerService.select(resource, reveal?)` and `IExplorerView.selectResource(...)` vocabulary.
- Explorer selection kind follows the workbench mode vocabulary: `table` and
  `chart`. The selected table-mode file may map to raw data and the selected
  chart-mode file may map to processed data, but command/action targets should
  not be named `analysis` or `titlebar` when the actual owner is Explorer/files
  or workbench mode switching.
- Tree/thumbnail layout is Conductor-specific view state. Keep it local to Explorer view/service state and do not document an upstream-style `setLayout(...)` method unless that method actually exists.
- The Explorer more actionbar may execute the thumbnail contribution's layout toggle command, but Explorer file item actions remain in the shared files action/command set for both tree and thumbnail layouts.
- File template selection belongs to Template canonical state. Explorer can host the action or expose local UI state, but should not own template selection semantics.

## Type Contracts

### `FileImportInput`

| Field | Meaning |
| --- | --- |
| `sources` | Files, paths, clipboard payloads, or manual table payloads to convert. |
| `importedAt` | Timestamp for diagnostics and replay/debug. |
| `options` | Conversion options such as normalized CSV preference or max inline size. |

### `FileConversionResult`

Use `FileConversionResult` for the output of `fileConverter.ts`.

| Field | Meaning |
| --- | --- |
| `files` | Converted file records containing raw table facts. |
| `diagnostics` | Source/conversion warnings and errors. |
| `createdAt` | Conversion result timestamp for debugging/import chronology. |

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
| `importState` | Current add-data/source collection and conversion state. Existing migration name may still say import. |
| `error` | User-visible Explorer import error. |
| `dragging` | Whether files are being dragged over Explorer. |

### `ExplorerSourceState` / current `ExplorerImportState`

Use `ExplorerSourceState` as the target name when introducing or renaming this contract. Existing migration code may still call it `ExplorerImportState`.

| Variant | Meaning |
| --- | --- |
| `idle` | No active source workflow. |
| `picking` | Open dialog is active. |
| `collecting` | Folder/drop sources are being collected. |
| `converting` / current `importing` | Files are being converted to raw tables. |
| `committing` | Conversion result is being committed to session. |
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
| `ExplorerService` | Owns Explorer state, exposes selection/layout/source workflow state events. |
| `fileActions.ts` / `fileImportExport.ts` workflow helpers | Coordinate dialogs/drop/folder source collection, file transfer/source helpers, `fileConverter.ts`, progress/notification, then return prepared imports to the caller. Session commit stays with the caller/session callback. |
| `common/explorerModel.ts` | Defines Explorer resource/item model and tree helpers. Do not create a separate `ExplorerTreeModel` class unless the upstream-style model file becomes too large. |
| `common/explorerFileNestingTrie.ts` | Owns Explorer file nesting pattern matching only. `explorerModel.ts` applies its output to tree nodes. |
| `ExplorerViewPane` | ViewPane host that listens to Explorer service events, consumes Explorer pane input, owns sidebar actions, and coordinates Explorer source workflow callbacks. |
| `ExplorerView` | DOM shell for drag/drop and view hosting. |
| `ExplorerViewer` | Tree/thumbnail renderer. |

Keep selection/focus state in `ExplorerService` until there is a concrete reason to extract it. Do not introduce `ExplorerSelectionStore` as a default layer.

Do not create `ExplorerManager` that owns `ImportManager`, `SelectionManager`, and `ThumbnailManager`. Those are separate responsibilities with different lifetimes.

## Naming Rules

Use `files` for capabilities and the feature/container area. Use `Explorer` for the UI layer, resource tree, view state, and user interaction. Use `fileConverter` for conversion-specific modules. Use `import` only for user-facing commands/labels or migration compatibility; internal code should prefer source collection, conversion, upload, download, copy, or commit vocabulary.

Good names:

```txt
explorerViewlet.ts
ExplorerView
ExplorerViewer
fileActions.ts
fileImportExport.ts
fileConverter.ts
fileConverter.worker.ts
FileConversionResult
RawTableRecord
```

Avoid:

```txt
IFileImportService
IFileViewService
IFilesExplorerService
filesPane.ts
filesPaneHost.ts
filesController.ts
explorerPaneInput.ts
explorerPaneViewInput.ts
explorerFileOptions.ts
ExplorerImportController
ExplorerSourceController
ExplorerTreeModel
ExplorerSelectionStore
ImportManager
FileViewImport
```

## Do Not

- Do not put `curveType`, `xAxisRole`, `needsTemplate`, or assessment confidence in conversion result.
- Do not generate measurement blocks here.
- Do not create plot series here.
- Do not commit session from `fileConverter.ts`.
- Do not let Explorer view code parse XLS/XLSX.
- Do not let Session read files from disk.
- Do not put Explorer, source collection, conversion, or import semantics into `platform/files` command handlers.
- Do not expose Explorer UI state from `IFileService`.
- Do not create thumbnail-specific duplicates of Explorer file item actions or commands.
- Do not move tree item hover trigger, timing, anchors, context-view placement, or dismissal into thumbnail contribution code.
- Do not move thumbnail bitmap/cache rendering into Explorer/files code; Explorer provides containers and user-intent wiring, thumbnail renders thumbnail content.
- Do not put thumbnail file visibility/filter helpers under `workbench/services/thumbnail`; Explorer/files owns those view-model decisions.
- Do not clear `IThumbnailService` global bitmap cache from Explorer view prop-change handling.
