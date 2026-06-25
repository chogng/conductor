/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import Papa from "papaparse";

import { Emitter, type Event } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import type { URI } from "src/cs/base/common/uri";
import {
  IFileService,
  type IFileContent,
  type IFileStat,
} from "src/cs/platform/files/common/files";
import {
  type FileConverterPreparedFile,
  type FileConverterPreparedSheet,
  type IFileConverterBackendService as IFileConverterBackendServiceType,
} from "src/cs/workbench/services/files/common/fileConverterBackend";
import {
  type TableSource,
  toTableSourceKey,
} from "src/cs/workbench/services/table/common/table";
import {
  type ITableModel,
  type TableModelContentSnapshot,
  type TableModelLoadState,
  type TableModelPreviewInput,
  type TableModelSheetSnapshot,
  type TableModelSnapshot,
} from "src/cs/workbench/services/table/common/tableModel";
import {
  tableFileFormatService,
  type TableFileFormat,
} from "src/cs/workbench/services/table/common/tableFileFormat";

type ResolvedExcelSheet = {
  readonly content: TableModelContentSnapshot;
  readonly sheetId: string;
  readonly sheetName: string | null;
  readonly sourceKey: string;
};

type TableModelResolveInput = {
  readonly fileName: string;
  readonly resourceFile: {
    readonly file: File;
    readonly text: string | null;
  };
  readonly stat: IFileStat;
};

export type TableFileEditorModelSnapshot = {
  readonly conflict: boolean;
  readonly dirty: boolean;
  readonly errorMessage: string;
  readonly lastResolvedStat: IFileStat | null;
  readonly orphaned: boolean;
  readonly resource: URI;
  readonly saving: boolean;
  readonly sourceVersion: number;
};

export class TableModel extends Disposable implements ITableModel {
  private readonly onDidChangeEmitter = this._register(new Emitter<ITableModel>());
  public readonly onDidChange = this.onDidChangeEmitter.event;

  private content: TableModelContentSnapshot | null = null;
  private format: TableFileFormat | null;
  private loadState: TableModelLoadState = { state: "idle", message: "" };
  private previewInput: TableModelPreviewInput | null = null;
  private readonly previewInputsBySourceKey = new Map<string, TableModelPreviewInput>();
  private sheets: readonly TableModelSheetSnapshot[] = [];
  private sourceVersion = 0;
  private version = 0;
  private resolveRequestId = 0;

  public constructor(
    public readonly resource: URI,
    public readonly sourceKey: string,
    private readonly fileConverterBackendService: IFileConverterBackendServiceType,
  ) {
    super();
    this.format = tableFileFormatService.getFormat(resource);
  }

  public getSnapshot(): TableModelSnapshot {
    return {
      content: this.content,
      format: this.format,
      loadState: this.loadState,
      resource: this.resource,
      previewInput: this.previewInput,
      sheets: this.sheets,
      sourceKey: this.sourceKey,
      sourceVersion: this.sourceVersion,
      version: this.version,
    };
  }

  public getPreviewInput(source?: TableSource | null): TableModelPreviewInput | null {
    const sourceKey = toTableSourceKey(source ?? { resource: this.resource });
    return this.previewInputsBySourceKey.get(sourceKey) ?? this.previewInput;
  }

  public async resolve({
    fileName,
    resourceFile,
    stat,
  }: TableModelResolveInput): Promise<void> {
    if (!tableFileFormatService.canHandle(this.resource)) {
      this.setError(`Unsupported table file: ${this.resource.toString()}`);
      return;
    }

    const requestId = ++this.resolveRequestId;
    this.format = tableFileFormatService.getFormat(this.resource);
    this.loadState = { state: "loading", message: "" };
    this.onDidChangeEmitter.fire(this);

    let nextContent: TableModelContentSnapshot | null = null;
    let nextPreviewInput: TableModelPreviewInput;
    try {
      const resolvedContent = await this.resolveResourceContent({
        fileName,
        resourceFile,
        stat,
      });
      nextContent = resolvedContent.content;
      nextPreviewInput = resolvedContent.previewInput;
      this.loadState = { state: "ready", message: "" };
    } catch (error) {
      const message = getErrorMessage(error);
      nextPreviewInput = createFailedResourcePreviewInput({
        message,
        resource: this.resource,
      });
      this.loadState = { state: "error", message };
    }

    if (requestId !== this.resolveRequestId) {
      return;
    }

    this.previewInput = nextPreviewInput;
    this.content = nextContent;
    this.sourceVersion = normalizeResourceSourceVersion(stat.mtime);
    this.version += 1;
    this.onDidChangeEmitter.fire(this);
  }

  private async resolveResourceContent({
    fileName,
    resourceFile,
    stat,
  }: {
    readonly fileName: string;
    readonly resourceFile: { readonly file: File; readonly text: string | null };
    readonly stat: IFileStat;
  }): Promise<{
    readonly content: TableModelContentSnapshot | null;
    readonly previewInput: TableModelPreviewInput;
  }> {
    if (this.format === "xls" || this.format === "xlsx") {
      const excelContent = await this.resolveExcelContent({
        file: resourceFile.file,
        fileName,
        stat,
      });
      if (excelContent) {
        return excelContent;
      }
    }

    const content = createTableModelContentSnapshot(resourceFile.text, this.format);
    const previewInput = createResourcePreviewInput({
      content,
      file: resourceFile.file,
      fileName,
      resource: this.resource,
      stat,
    });
    this.sheets = content ? [{
      content,
      sheetId: this.sourceKey,
      sheetName: null,
      sourceKey: this.sourceKey,
    }] : [];
    this.previewInputsBySourceKey.clear();
    this.previewInputsBySourceKey.set(this.sourceKey, previewInput);
    return { content, previewInput };
  }

  private async resolveExcelContent({
    file,
    fileName,
    stat,
  }: {
    readonly file: File;
    readonly fileName: string;
    readonly stat: IFileStat;
  }): Promise<{
    readonly content: TableModelContentSnapshot | null;
    readonly previewInput: TableModelPreviewInput;
  } | null> {
    const sourcePath = getResourcePath(this.resource);
    if (!sourcePath || !this.fileConverterBackendService.canPrepareFile()) {
      return null;
    }

    const prepared = await this.fileConverterBackendService.prepareFile({
      fileName,
      path: sourcePath,
      sourceMtimeMs: normalizeResourceSourceVersion(stat.mtime),
      sourceSizeBytes: normalizeResourceSourceVersion(stat.size),
    });
    const sheets = await this.createExcelSheetSnapshots(prepared);
    if (!sheets.length) {
      return null;
    }

    this.sheets = sheets.map(sheet => ({
      content: sheet.content,
      sheetId: sheet.sheetId,
      sheetName: sheet.sheetName,
      sourceKey: sheet.sourceKey,
    }));
    this.previewInputsBySourceKey.clear();

    let primaryPreviewInput: TableModelPreviewInput | null = null;
    for (const sheet of sheets) {
      const previewInput = createResourcePreviewInput({
        content: sheet.content,
        file,
        fileName,
        resource: this.resource,
        sheetId: sheet.sheetId,
        sheetName: sheet.sheetName,
        stat,
      });
      this.previewInputsBySourceKey.set(sheet.sourceKey, previewInput);
      primaryPreviewInput ??= previewInput;
    }

    return {
      content: sheets[0]?.content ?? null,
      previewInput: primaryPreviewInput ?? createResourcePreviewInput({
        content: null,
        file,
        fileName,
        resource: this.resource,
        stat,
      }),
    };
  }

  private async createExcelSheetSnapshots(
    prepared: FileConverterPreparedFile,
  ): Promise<readonly ResolvedExcelSheet[]> {
    const preparedSheets = getPreparedSheets(prepared);
    if (preparedSheets.length) {
      const sheets: ResolvedExcelSheet[] = [];
      for (let index = 0; index < preparedSheets.length; index += 1) {
        const sheet = preparedSheets[index]!;
        const csvText = await this.readPreparedSheetCsvText(sheet);
        const content = createTableModelContentSnapshot(csvText, "csv") ??
          createTableModelContentFromPreparedSheet(sheet);
        if (!content) {
          continue;
        }
        const sheetId = getPreparedSheetId(sheet, index);
        const sheetName = getPreparedSheetName(sheet);
        const sourceKey = toTableSourceKey({
          resource: this.resource,
          sheetId,
        });
        sheets.push({
          content,
          sheetId,
          sheetName,
          sourceKey,
        });
      }
      return sheets;
    }

    const content = createTableModelContentSnapshot(prepared.csvText ?? null, "csv") ??
      createTableModelContentFromPreparedFile(prepared);
    return content ? [{
      content,
      sheetId: this.sourceKey,
      sheetName: null,
      sourceKey: this.sourceKey,
    }] : [];
  }

  private async readPreparedSheetCsvText(
    sheet: FileConverterPreparedSheet,
  ): Promise<string | null> {
    if (typeof sheet.csvText === "string") {
      return sheet.csvText;
    }
    const normalizedCsvPath = typeof sheet.normalizedCsvPath === "string"
      ? sheet.normalizedCsvPath.trim()
      : "";
    if (!normalizedCsvPath || !this.fileConverterBackendService.canReadConvertedCsv()) {
      return null;
    }

    const result = await this.fileConverterBackendService.readConvertedCsv({
      path: normalizedCsvPath,
    });
    return result.ok && typeof result.csvText === "string" ? result.csvText : null;
  }

  private setError(message: string): void {
    this.loadState = { state: "error", message };
    this.previewInput = createFailedResourcePreviewInput({
      message,
      resource: this.resource,
    });
    this.content = null;
    this.sheets = [];
    this.sourceVersion = 0;
    this.previewInputsBySourceKey.clear();
    this.version += 1;
    this.onDidChangeEmitter.fire(this);
  }
}

export class TableFileEditorModel extends Disposable {
  private readonly onDidChangeStateEmitter = this._register(new Emitter<TableFileEditorModel>());
  public readonly onDidChangeState: Event<TableFileEditorModel> =
    this.onDidChangeStateEmitter.event;

  public readonly model: TableModel;

  private conflict = false;
  private dirty = false;
  private errorMessage = "";
  private lastResolvedStat: IFileStat | null = null;
  private orphaned = false;
  private pendingText: string | null = null;
  private saving = false;
  private sourceVersion = 0;

  public constructor(
    public readonly resource: URI,
    sourceKey: string,
    private readonly fileService: IFileService,
    fileConverterBackendService: IFileConverterBackendServiceType,
  ) {
    super();
    this.model = this._register(new TableModel(
      resource,
      sourceKey,
      fileConverterBackendService,
    ));
    this._register(this.fileService.watch(resource, { recursive: false }));
  }

  public getSourceVersion(): number {
    return this.sourceVersion;
  }

  public getSnapshot(): TableFileEditorModelSnapshot {
    return {
      conflict: this.conflict,
      dirty: this.dirty,
      errorMessage: this.errorMessage,
      lastResolvedStat: this.lastResolvedStat,
      orphaned: this.orphaned,
      resource: this.resource,
      saving: this.saving,
      sourceVersion: this.sourceVersion,
    };
  }

  public getLastResolvedStat(): IFileStat | null {
    return this.lastResolvedStat;
  }

  public isDirty(): boolean {
    return this.dirty;
  }

  public isSaving(): boolean {
    return this.saving;
  }

  public async resolve(): Promise<void> {
    try {
      await this.resolveFromDisk();
      this.setLifecycleState({
        conflict: false,
        errorMessage: "",
        orphaned: false,
      });
    } catch (error) {
      this.setLifecycleState({
        errorMessage: getErrorMessage(error),
        orphaned: true,
      });
      throw error;
    }
  }

  public async reload(): Promise<void> {
    await this.resolve();
  }

  public markDirty(text: string): void {
    this.pendingText = text;
    this.setLifecycleState({
      dirty: true,
      errorMessage: "",
    });
  }

  public markConflict(): void {
    this.setLifecycleState({ conflict: true });
  }

  public markOrphaned(orphaned: boolean): void {
    this.setLifecycleState({
      orphaned,
      ...(orphaned ? {} : { errorMessage: "" }),
    });
  }

  public async save(text?: string): Promise<void> {
    if (typeof text === "string") {
      this.markDirty(text);
    }
    if (!this.dirty || this.pendingText === null) {
      return;
    }

    this.setLifecycleState({
      errorMessage: "",
      saving: true,
    });
    try {
      await this.fileService.writeFile(this.resource, this.pendingText);
      this.pendingText = null;
      this.setLifecycleState({
        conflict: false,
        dirty: false,
        orphaned: false,
      });
      await this.resolveFromDisk();
    } catch (error) {
      this.setLifecycleState({
        errorMessage: getErrorMessage(error),
      });
      throw error;
    } finally {
      this.setLifecycleState({ saving: false });
    }
  }

  public async revert(): Promise<void> {
    this.pendingText = null;
    this.setLifecycleState({
      conflict: false,
      dirty: false,
      errorMessage: "",
    });
    await this.resolve();
  }

  private async resolveFromDisk(): Promise<void> {
    const stat = await this.fileService.stat(this.resource);
    const fileName = getResourceFileName(this.resource);
    const resourceFile = await readResourceAsBrowserFile({
      fileName,
      fileService: this.fileService,
      resource: this.resource,
      stat,
    });

    this.lastResolvedStat = stat;
    this.sourceVersion = normalizeResourceSourceVersion(stat.mtime);
    await this.model.resolve({
      fileName,
      resourceFile,
      stat,
    });
    this.onDidChangeStateEmitter.fire(this);
  }

  private setLifecycleState(update: {
    readonly conflict?: boolean;
    readonly dirty?: boolean;
    readonly errorMessage?: string;
    readonly orphaned?: boolean;
    readonly saving?: boolean;
  }): void {
    const nextConflict = update.conflict ?? this.conflict;
    const nextDirty = update.dirty ?? this.dirty;
    const nextErrorMessage = update.errorMessage ?? this.errorMessage;
    const nextOrphaned = update.orphaned ?? this.orphaned;
    const nextSaving = update.saving ?? this.saving;
    if (
      nextConflict === this.conflict &&
      nextDirty === this.dirty &&
      nextErrorMessage === this.errorMessage &&
      nextOrphaned === this.orphaned &&
      nextSaving === this.saving
    ) {
      return;
    }

    this.conflict = nextConflict;
    this.dirty = nextDirty;
    this.errorMessage = nextErrorMessage;
    this.orphaned = nextOrphaned;
    this.saving = nextSaving;
    this.onDidChangeStateEmitter.fire(this);
  }
}

const createResourcePreviewInput = ({
  content,
  file,
  fileName,
  resource,
  sheetId,
  sheetName,
  stat,
}: {
  readonly content: TableModelContentSnapshot | null;
  readonly file: File;
  readonly fileName: string;
  readonly resource: URI;
  readonly sheetId?: string | null;
  readonly sheetName?: string | null;
  readonly stat: IFileStat;
}): TableModelPreviewInput => ({
  file,
  fileName,
  resource,
  relativePath: fileName,
  ...(sheetId ? { sheetId } : {}),
  ...(sheetName ? { sheetName } : {}),
  ...(content ? {
    columnCount: content.columnCount,
    maxCellLengths: content.maxCellLengths,
    rowCount: content.rowCount,
    tableModelContent: content,
  } : {}),
  sourcePath: getResourcePath(resource),
  sourceVersion: normalizeResourceSourceVersion(stat.mtime),
});

const createFailedResourcePreviewInput = ({
  message,
  resource,
}: {
  readonly message: string;
  readonly resource: URI;
}): TableModelPreviewInput => {
  const fileName = getResourceFileName(resource);
  return {
    file: new File([], fileName, {
      lastModified: Date.now(),
      type: getResourceFileMimeType(fileName),
    }),
    fileName,
    resource,
    rawTableHealth: "decodeFailed",
    rawTableHealthMessage: message,
    relativePath: fileName,
    sourcePath: getResourcePath(resource),
    sourceVersion: 0,
  };
};

const readResourceAsBrowserFile = async ({
  fileName,
  fileService,
  resource,
  stat,
}: {
  readonly fileName: string;
  readonly fileService: IFileService;
  readonly resource: URI;
  readonly stat: IFileStat;
}): Promise<{ readonly file: File; readonly text: string | null }> => {
  const content = await fileService.readFile(resource, {
    encoding: tableFileFormatService.isExcel(resource) ? "base64" : "utf8",
  });
  if (!isFileContent(content)) {
    throw new Error("The file content could not be read.");
  }

  return {
    file: new File([toFilePart(content)], fileName, {
      lastModified: normalizeResourceSourceVersion(stat.mtime) || Date.now(),
      type: getResourceFileMimeType(fileName),
    }),
    text: content.encoding === "utf8" ? content.value : null,
  };
};

const isFileContent = (value: unknown): value is IFileContent => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<IFileContent>;
  return (candidate.encoding === "base64" || candidate.encoding === "utf8") &&
    typeof candidate.value === "string";
};

const toFilePart = (content: IFileContent): string | ArrayBuffer =>
  content.encoding === "base64" ? decodeBase64(content.value) : content.value;

const decodeBase64 = (value: string): ArrayBuffer => {
  const binary = globalThis.atob(value);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return buffer;
};

const getResourceFileName = (resource: URI): string => {
  const path = String(resource.path ?? "").replace(/\\/g, "/");
  const index = path.lastIndexOf("/");
  const name = index >= 0 ? path.slice(index + 1) : path;
  return name || "table.csv";
};

const getResourcePath = (resource: URI): string | null => {
  const fsPath = typeof resource.fsPath === "string" ? resource.fsPath.trim() : "";
  if (fsPath) {
    return fsPath;
  }

  const path = String(resource.path ?? "").trim();
  return path || null;
};

const getResourceFileMimeType = (fileName: string): string => {
  if (tableFileFormatService.isExcel(fileName)) {
    return "application/octet-stream";
  }
  if (tableFileFormatService.isTsv(fileName)) {
    return "text/tab-separated-values;charset=utf-8";
  }
  return "text/csv;charset=utf-8";
};

const normalizeResourceSourceVersion = (value: unknown): number =>
  Math.max(0, Math.floor(Number(value) || 0));

const createTableModelContentSnapshot = (
  text: string | null,
  format: TableFileFormat | null,
): TableModelContentSnapshot | null => {
  if (text === null || (format !== "csv" && format !== "tsv")) {
    return null;
  }

  const parsed = Papa.parse<unknown[]>(text, {
    delimiter: format === "tsv" ? "\t" : ",",
    skipEmptyLines: false,
  });
  const rows = parsed.data.map(row => row.map(cell => cell == null ? "" : String(cell)));
  const columnCount = rows.reduce(
    (count, row) => Math.max(count, row.length),
    0,
  );
  const maxCellLengths = Array.from({ length: columnCount }, (_, columnIndex) =>
    rows.reduce(
      (length, row) => Math.max(length, String(row[columnIndex] ?? "").length),
      0,
    )
  );
  return {
    columnCount,
    maxCellLengths,
    rowCount: rows.length,
    rows,
  };
};

const getPreparedSheets = (
  prepared: FileConverterPreparedFile,
): readonly FileConverterPreparedSheet[] => {
  if (Array.isArray(prepared.sheets)) {
    return prepared.sheets;
  }

  const manifest = prepared.manifest;
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    return [];
  }

  const sheets = (manifest as { sheets?: unknown }).sheets;
  return Array.isArray(sheets)
    ? sheets.filter((sheet): sheet is FileConverterPreparedSheet =>
        Boolean(sheet) && typeof sheet === "object" && !Array.isArray(sheet)
      )
    : [];
};

const getPreparedSheetId = (
  sheet: FileConverterPreparedSheet,
  fallbackIndex: number,
): string => {
  const index = Number.isInteger(sheet.sheetIndex)
    ? Math.max(0, Number(sheet.sheetIndex))
    : fallbackIndex;
  const name = getPreparedSheetName(sheet);
  return name ? `${index}:${name}` : String(index);
};

const getPreparedSheetName = (
  sheet: FileConverterPreparedSheet,
): string | null =>
  typeof sheet.sheetName === "string" && sheet.sheetName.trim()
    ? sheet.sheetName.trim()
    : null;

const createTableModelContentFromPreparedFile = (
  prepared: FileConverterPreparedFile,
): TableModelContentSnapshot | null =>
  createEmptyTableModelContentSnapshot(prepared.rowCount, prepared.columnCount, prepared.maxCellLengths);

const createTableModelContentFromPreparedSheet = (
  sheet: FileConverterPreparedSheet,
): TableModelContentSnapshot | null =>
  createEmptyTableModelContentSnapshot(sheet.rowCount, sheet.columnCount, sheet.maxCellLengths);

const createEmptyTableModelContentSnapshot = (
  rowCount: unknown,
  columnCount: unknown,
  maxCellLengths: readonly number[] | undefined,
): TableModelContentSnapshot | null => {
  const normalizedRowCount = normalizeNonNegativeInteger(rowCount);
  const normalizedColumnCount = normalizeNonNegativeInteger(columnCount);
  if (normalizedRowCount === null || normalizedColumnCount === null) {
    return null;
  }

  return {
    columnCount: normalizedColumnCount,
    maxCellLengths: normalizeMaxCellLengths(maxCellLengths, normalizedColumnCount),
    rowCount: normalizedRowCount,
    rows: [],
  };
};

const normalizeNonNegativeInteger = (value: unknown): number | null => {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
};

const normalizeMaxCellLengths = (
  values: readonly number[] | undefined,
  columnCount: number,
): readonly number[] =>
  Array.from({ length: columnCount }, (_, index) => {
    const value = Number(values?.[index]);
    return Number.isFinite(value) && value >= 0 ? value : 0;
  });

const getErrorMessage = (error: unknown): string =>
  error instanceof Error && error.message.trim()
    ? error.message
    : "The file could not be read.";
