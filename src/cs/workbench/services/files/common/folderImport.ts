/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { URI } from "src/cs/base/common/uri";
import type {
  FileSource,
  ImportFileData,
  PathFileSource,
} from "src/cs/workbench/services/files/common/files";

export type FolderImportFileSource = PathFileSource & {
  readonly loadFile: () => Promise<ImportFileData>;
};

export type FolderFileReadFailure = {
  readonly fileName: string;
  readonly message: string;
  readonly relativePath: string;
};

export type FolderFileCollection = {
  readonly files: FolderImportFileSource[];
  readonly readFailures: FolderFileReadFailure[];
};

export type FolderFileCollectionBatch = {
  readonly files: FolderImportFileSource[];
};

export type FolderImportFiles = {
  readonly files: FileSource[];
  readonly folder: URI;
  readonly readFailures: FolderFileReadFailure[];
};
