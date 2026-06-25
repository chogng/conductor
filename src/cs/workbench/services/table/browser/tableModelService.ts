/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, type Event } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import type { URI } from "src/cs/base/common/uri";
import {
  type IFileContent,
  type IFileService,
  type IFileStat,
} from "src/cs/platform/files/common/files";
import type { SessionFile } from "src/cs/workbench/services/session/common/sessionTypes";
import {
  toTableSourceKey,
  type TableSource,
} from "src/cs/workbench/services/table/common/table";
import {
  type ITableModel,
  type ITableModelService,
  type TableModelLoadState,
  type TableModelSnapshot,
} from "src/cs/workbench/services/table/common/tableModel";
import {
  tableFileFormatService,
  type TableFileFormat,
} from "src/cs/workbench/services/table/common/tableFileFormat";

export class TableModel extends Disposable implements ITableModel {
  private readonly onDidChangeEmitter = this._register(new Emitter<ITableModel>());
  public readonly onDidChange = this.onDidChangeEmitter.event;

  private format: TableFileFormat | null;
  private loadState: TableModelLoadState = { state: "idle", message: "" };
  private sessionFile: SessionFile | null = null;
  private version = 0;
  private resolveRequestId = 0;

  public constructor(
    public readonly resource: URI,
    public readonly sourceKey: string,
    private readonly fileService: IFileService,
  ) {
    super();
    this.format = tableFileFormatService.getFormat(resource);
  }

  public getSnapshot(): TableModelSnapshot {
    return {
      format: this.format,
      loadState: this.loadState,
      resource: this.resource,
      sessionFile: this.sessionFile,
      sourceKey: this.sourceKey,
      version: this.version,
    };
  }

  public async resolve(): Promise<void> {
    if (!tableFileFormatService.canHandle(this.resource)) {
      this.setError(`Unsupported table file: ${this.resource.toString()}`);
      return;
    }

    const requestId = ++this.resolveRequestId;
    this.format = tableFileFormatService.getFormat(this.resource);
    this.loadState = { state: "loading", message: "" };
    this.onDidChangeEmitter.fire(this);

    let nextSessionFile: SessionFile;
    try {
      const stat = await this.fileService.stat(this.resource);
      const fileName = getResourceFileName(this.resource);
      const file = await readResourceAsBrowserFile({
        fileName,
        fileService: this.fileService,
        resource: this.resource,
        stat,
      });
      nextSessionFile = createResourceSessionFile({
        file,
        fileName,
        resource: this.resource,
        sourceKey: this.sourceKey,
        stat,
      });
      this.loadState = { state: "ready", message: "" };
    } catch (error) {
      const message = getErrorMessage(error);
      nextSessionFile = createFailedResourceSessionFile({
        message,
        resource: this.resource,
        sourceKey: this.sourceKey,
      });
      this.loadState = { state: "error", message };
    }

    if (requestId !== this.resolveRequestId) {
      return;
    }

    this.sessionFile = nextSessionFile;
    this.version += 1;
    this.onDidChangeEmitter.fire(this);
  }

  private setError(message: string): void {
    this.loadState = { state: "error", message };
    this.sessionFile = createFailedResourceSessionFile({
      message,
      resource: this.resource,
      sourceKey: this.sourceKey,
    });
    this.version += 1;
    this.onDidChangeEmitter.fire(this);
  }
}

export class TableModelService extends Disposable implements ITableModelService {
  private readonly onDidChangeModelEmitter =
    this._register(new Emitter<ITableModel>());
  public readonly onDidChangeModel: Event<ITableModel> =
    this.onDidChangeModelEmitter.event;

  private readonly models = new Map<string, TableModel>();
  private readonly pendingResolves = new Map<string, Promise<void>>();

  public constructor(
    private readonly fileService: IFileService,
  ) {
    super();
  }

  public get(resource: URI | null | undefined): ITableModel | undefined {
    const key = getResourceKey(resource);
    return key ? this.models.get(key) : undefined;
  }

  public getSessionFile(source: TableSource | null | undefined): SessionFile | null {
    const model = this.get(source?.resource);
    return model?.getSnapshot().sessionFile ?? null;
  }

  public resolve(resource: URI, source?: TableSource | null): void {
    const key = getResourceKey(resource);
    if (!key) {
      return;
    }

    let model = this.models.get(key);
    if (!model) {
      model = this._register(new TableModel(
        resource,
        toTableSourceKey(source ?? { resource }),
        this.fileService,
      ));
      this._register(model.onDidChange(changedModel => {
        this.onDidChangeModelEmitter.fire(changedModel);
      }));
      this.models.set(key, model);
    }

    if (this.pendingResolves.has(key)) {
      return;
    }

    const pendingResolve = model.resolve().finally(() => {
      if (this.pendingResolves.get(key) === pendingResolve) {
        this.pendingResolves.delete(key);
      }
    });
    this.pendingResolves.set(key, pendingResolve);
  }
}

const getResourceKey = (resource: URI | null | undefined): string | null => {
  const key = resource?.toString()?.trim() ?? "";
  return key || null;
};

const createResourceSessionFile = ({
  file,
  fileName,
  resource,
  sourceKey,
  stat,
}: {
  readonly file: File;
  readonly fileName: string;
  readonly resource: URI;
  readonly sourceKey: string;
  readonly stat: IFileStat;
}): SessionFile => ({
  file,
  fileId: resource.toString(),
  fileName,
  resource,
  relativePath: fileName,
  sourceKey,
  sourcePath: getResourcePath(resource),
  sourceVersion: normalizeResourceSourceVersion(stat.mtime),
});

const createFailedResourceSessionFile = ({
  message,
  resource,
  sourceKey,
}: {
  readonly message: string;
  readonly resource: URI;
  readonly sourceKey: string;
}): SessionFile => {
  const fileName = getResourceFileName(resource);
  return {
    file: new File([], fileName, {
      lastModified: Date.now(),
      type: getResourceFileMimeType(fileName),
    }),
    fileId: resource.toString(),
    fileName,
    resource,
    rawTableHealth: "decodeFailed",
    rawTableHealthMessage: message,
    relativePath: fileName,
    sourceKey,
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
}): Promise<File> => {
  const content = await fileService.readFile(resource, {
    encoding: tableFileFormatService.isExcel(resource) ? "base64" : "utf8",
  });
  if (!isFileContent(content)) {
    throw new Error("The file content could not be read.");
  }

  return new File([toFilePart(content)], fileName, {
    lastModified: normalizeResourceSourceVersion(stat.mtime) || Date.now(),
    type: getResourceFileMimeType(fileName),
  });
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

const getErrorMessage = (error: unknown): string =>
  error instanceof Error && error.message.trim()
    ? error.message
    : "The file could not be read.";

