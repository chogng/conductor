import type { Event } from "../../../base/common/event.js";
import type { IDisposable } from "../../../base/common/lifecycle.js";
import type { URI } from "../../../base/common/uri.js";
import { createDecorator } from "../../instantiation/common/instantiation.js";
import type { IReadFileRangeOptions } from "./io.js";

export const IFileService = createDecorator<IFileService>("fileService");

export const LOCAL_FILE_SYSTEM_CHANNEL_NAME = "localFilesystem";

export const enum FileType {
  Unknown = 0,
  File = 1,
  Directory = 2,
  SymbolicLink = 64,
}

export type IFileStat = {
  readonly ctime: number;
  readonly mtime: number;
  readonly path: string;
  readonly size: number;
  readonly type: FileType;
};

export type IReadFileEncoding = "base64" | "utf8";

export type IReadFileOptions = IReadFileRangeOptions & {
  readonly encoding?: IReadFileEncoding;
};

export type IFileContent = {
  readonly encoding: IReadFileEncoding;
  readonly value: string;
};

export type IWatchOptions = {
  readonly recursive?: boolean;
};

export const LOCAL_FILE_SYSTEM_FILE_CHANGE_EVENT = "fileChange";

export const enum FileChangeType {
  UPDATED = 0,
  ADDED = 1,
  DELETED = 2,
}

export type IFileChange = {
  readonly resource: URI;
  readonly type: FileChangeType;
};

export interface IFileService {
  readonly _serviceBrand: undefined;

  readonly onDidFilesChange: Event<readonly IFileChange[]>;

  registerProvider(scheme: string, provider: IFileSystemProvider): IDisposable;
  getProvider(scheme: string): IFileSystemProvider | undefined;
  exists(resource: URI): Promise<boolean>;
  readDir(resource: URI): Promise<readonly [string, FileType][]>;
  readFile(resource: URI, options?: IReadFileOptions): Promise<IFileContent>;
  writeFile(resource: URI, content: string): Promise<void>;
  realpath(resource: URI): Promise<URI>;
  stat(resource: URI): Promise<IFileStat>;
  watch(resource: URI, options?: IWatchOptions): IDisposable;
}

export interface IFileSystemProvider {
  readonly onDidFilesChange: Event<readonly IFileChange[]>;

  exists(resource: URI): Promise<boolean>;
  readDir(resource: URI): Promise<readonly [string, FileType][]>;
  readFile(resource: URI, options?: IReadFileOptions): Promise<IFileContent>;
  writeFile(resource: URI, content: string): Promise<void>;
  realpath(resource: URI): Promise<URI>;
  stat(resource: URI): Promise<IFileStat>;
  watch(resource: URI, options?: IWatchOptions): IDisposable;
}
