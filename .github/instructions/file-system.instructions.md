---
description: Platform file system service — filesystem provider registration, stat, read/write, directory listing, and watch behavior. Use when working under `src/cs/platform/files`.
applyTo: 'src/cs/platform/files/**'
---
# Platform File System

`IFileService` is a platform service. It represents filesystem capability, not the left Explorer and not the analysis import pipeline.

## Ownership

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

## Core files

| File | Responsibility |
| --- | --- |
| `src/cs/platform/files/common/files.ts` | Defines `IFileService`, `IFileSystemProvider`, `FileType`, file stat/read/write/watch contracts, and the service decorator. No workbench import. |
| `src/cs/platform/files/common/io.ts` | Common read range and stream/range option types. No DOM or Electron. |
| `src/cs/platform/files/browser/webFileSystemAccess.ts` | Browser File System Access API adapter and folder import capability detection. No session or explorer model. |
| `src/cs/platform/files/browser/htmlFileSystemProvider.ts` | Browser-side provider implementation for web-accessible file handles. Implements provider contract only. |
| `src/cs/platform/files/electron-browser/fileService.ts` | Renderer-side desktop file service bridge. IPC boundary only; no analysis import semantics. |
| `src/cs/platform/files/electron-main/*` | Main-process provider implementation when desktop local filesystem access is required. |

## Dependency rules

Allowed imports:

```txt
platform/files -> base
platform/files/electron-browser -> platform ipc abstractions
```

Forbidden imports:

```txt
platform/files -> workbench/services/session
platform/files -> workbench/services/explorer
platform/files -> workbench/services/files
platform/files -> workbench/contrib/*
```

## Usage pattern

```ts
class ExplorerImportController {
  constructor(
    @IFileService private readonly fileService: IFileService,
    @IExplorerService private readonly explorerService: IExplorerService,
  ) {}

  async openFolder(resource: URI): Promise<void> {
    const entries = await this.fileService.readDir(resource);
    await this.explorerService.addFolder(resource, entries);
  }
}
```

`IFileService` returns filesystem facts. `IExplorerService` decides how those facts become Explorer resources.

## Command entry and dispatch

`IFileService` is a platform capability. It should rarely own workbench commands directly.

Workbench commands that need filesystem access should call a workbench service or controller, and that service/controller may depend on `IFileService`.

Example:

```txt
Explorer import folder command
  -> IExplorerService / ExplorerImportController
  -> IFileDialogService + IFileService
  -> fileConverter.ts / files import-export workflow
  -> ISessionService.commitFileImport
```

Do not put Explorer or import semantics into `platform/files` command handlers.

## Do not

- Do not add `importFiles`, `prepareFile`, `assessFile`, or `processFile` here.
- Do not create `RawTableRecord` here.
- Do not expose UI state such as selected file or expanded folders.
- Do not call `ISessionService` from platform files.
