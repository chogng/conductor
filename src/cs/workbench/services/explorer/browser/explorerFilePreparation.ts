/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import {
  convertImportFile,
  FileConvertError,
  loadConvertedCsvFile,
  type ConvertedImportFile,
  type FileConverterMetadata,
  type FileConverterSource,
} from "src/cs/workbench/services/files/browser/fileConverter";
import type {
  FileConverterBackend,
} from "src/cs/workbench/services/files/common/fileConverterBackend";

export type PreparedBrowserFile = ConvertedImportFile;

export type ImportFileSource = FileConverterSource;

export type ImportFileMetadata = FileConverterMetadata;

export { loadConvertedCsvFile };

export class ImportPrepareError extends Error {
  public readonly code: string | null;

  constructor(
    message: string,
    code: string | null = null,
  ) {
    super(message);
    this.code = code;
    this.name = "ImportPrepareError";
  }
}

const toImportPrepareError = (error: FileConvertError): ImportPrepareError =>
  new ImportPrepareError(error.message, error.code);

export const prepareImportFile = async (
  fileConverterBackend: FileConverterBackend,
  file: File | null,
  source: ImportFileSource,
  metadata: ImportFileMetadata,
): Promise<PreparedBrowserFile> => {
  let converted: ConvertedImportFile;
  try {
    converted = await convertImportFile(
      fileConverterBackend,
      file,
      source,
      metadata,
    );
  } catch (error) {
    if (error instanceof FileConvertError) {
      throw toImportPrepareError(error);
    }
    throw error;
  }

  return converted;
};
