---
description: Files import and raw table conversion architecture — CSV/XLS/XLSX/clipboard conversion, raw table records, normalized CSV artifacts, and import/export workflow boundaries. This is not platform IFileService and not Explorer view rendering.
applyTo: 'src/cs/workbench/services/files/**,src/cs/workbench/contrib/files/browser/fileImportExport.ts,src/cs/workbench/services/analysisFile/browser/{fileConversion.ts,xlsxConversionWorker.ts,filePreviewService.ts,importPipeline.ts}'
---
# Files Import and Raw Table Conversion

The `files` feature is the broad workbench area for imported data files. Do not confuse it with platform `IFileService` or the left `ExplorerView`.

Current target:

```txt
platform/files/IFileService
  filesystem capability

workbench/contrib/files
  files feature contribution and import/export workflow

workbench/services/explorer/IExplorerService
  left Explorer resource tree and selection

workbench/services/files/fileConverter.ts
  CSV/XLS/XLSX/clipboard -> FileImportResult / RawTableRecord payloads
```

Do not introduce `IFileImportService` by default. There is not yet a stable service abstraction that justifies it. Keep conversion as a focused converter module and keep user workflow orchestration in Explorer/files controllers.

## Ownership

Files import/conversion owns:

- reading import source metadata supplied by Explorer/fileImportExport;
- converting CSV, XLS, XLSX, clipboard, or manual inputs into raw table facts;
- generating one `RawTableRecord` per CSV table or Excel sheet;
- writing or referencing normalized CSV artifacts;
- returning import diagnostics;
- producing `FileImportResult` for `ISessionService.commitFileImport(...)`.

It does not own:

- platform filesystem providers;
- Explorer tree state;
- user selection/focus/expanded folder state;
- IV/CV/CF/PV/IT detection;
- measurement block detection;
- template application;
- plot/chart generation;
- session mutation.

## Recommended files

| File | Responsibility | Inputs | Outputs | Must not do |
| --- | --- | --- | --- | --- |
| `src/cs/workbench/services/files/common/rawTable.ts` | Defines raw table records: `RangeRef`, `RawTableRangeRef`, `RawTableRecord`, `RawTableRowsRecord`, `RawTableSourceRecord`. | None; type-only. | Shared raw table types. | Import browser APIs, parse files, or define assessment fields. |
| `src/cs/workbench/services/files/common/files.ts` | Defines files-import data contracts: `FileImportInput`, `FileImportResult`, `FileImportDiagnostic`, source kinds. | None; type-only. | Import/conversion contracts. | Define `IFileImportService` unless a stable service boundary is intentionally added later. |
| `src/cs/workbench/services/files/browser/fileConverter.ts` | Converts CSV/XLS/XLSX/clipboard/manual sources into `FileImportResult`. Replaces old `fileConversion.ts` + most of `xlsxConversionWorker.ts` coordination. | `FileImportInput`, source bytes/path metadata, optional converter worker. | `FileImportResult`, `RawTableRecord`, normalized CSV refs, diagnostics. | Call `IAssessmentService`, commit session, touch Explorer state, or render preview. |
| `src/cs/workbench/services/files/browser/fileConverter.worker.ts` | Optional worker for expensive workbook conversion. | Workbook bytes / file reference. | Per-sheet raw table payloads or normalized CSV artifact refs. | Own UI state or session state. |
| `src/cs/workbench/contrib/files/browser/fileImportExport.ts` | Files feature import/export workflow helpers: folder walking, source collection, external upload/download scenario utilities. | `IFileService`, URI/file sources, folder resources. | `FileSource[]`, read failures, download/upload side effects. | Become a generic import service or parse assessment semantics. |
| `src/cs/workbench/services/analysisFile/browser/importPipeline.ts` | Migration-only. Retire after Explorer import controller + `fileConverter.ts` exist. | Legacy pending import objects. | Legacy prepared file info. | Continue to grow. |
| `src/cs/workbench/services/analysisFile/browser/fileConversion.ts` | Migration-only. Move conversion into `services/files/browser/fileConverter.ts`. | Legacy file/path metadata. | Legacy prepared browser file. | Call `assessImportFile` in the target architecture. |
| `src/cs/workbench/services/analysisFile/browser/xlsxConversionWorker.ts` | Migration-only worker. Fold into `fileConverter.worker.ts` if still needed. | XLS/XLSX file. | CSV/raw table payload. | Know about session, Explorer, template, or assessment. |
| `src/cs/workbench/services/analysisFile/browser/filePreviewService.ts` | Re-evaluate. Raw preview likely belongs to `ITableService`; keep only if it becomes a narrow raw row reader. | Raw table refs / normalized CSV refs. | Preview rows. | Become a second TableService or AnalysisFileService. |

## Import workflow

```mermaid
flowchart TD
    UI[Explorer drop/dialog/clipboard] --> ExplorerController[ExplorerImportController]
    ExplorerController --> FileImportExport[fileImportExport.ts]
    ExplorerController --> Converter[fileConverter.ts]
    Converter --> RawTables[FileImportResult + RawTableRecord[]]
    ExplorerController --> Session[ISessionService.commitFileImport]
    Session --> Event[rawTablesChanged]
    Event --> Assessment[IAssessmentService]
```

Explorer controls the user-facing workflow. `fileImportExport.ts` collects sources. `fileConverter.ts` converts. Session commits. Assessment interprets structure later.

## Type contracts

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

## Naming rules

Use `files import` for the overall feature. Use `explorer import` only when talking about the left Explorer UI entry point.

Good names:

```txt
fileImportExport.ts
fileConverter.ts
fileConverter.worker.ts
ExplorerImportController
FileImportResult
RawTableRecord
```

Avoid:

```txt
IFileImportService
ImportManager
FileViewImport
AnalysisFileImportPipeline
```

## Do not

- Do not put `curveType`, `xAxisRole`, `needsTemplate`, or assessment confidence in import result.
- Do not generate measurement blocks here.
- Do not create plot series here.
- Do not commit session from `fileConverter.ts`.
- Do not let Explorer parse XLS/XLSX.
- Do not let Session read files from disk.
