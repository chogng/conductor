/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

export type RangeRef = {
  readonly startRow: number;
  readonly endRow: number;
  readonly startCol: number;
  readonly endCol: number;
};

export type RawTableRangeRef = {
  readonly fileId: string;
  readonly rawTableId: string;
  readonly range: RangeRef;
};

export type RawTableSourceRecord =
  | {
      readonly kind: "csv";
      readonly originalPath?: string | null;
    }
  | {
      readonly kind: "excelSheet";
      readonly sheetIndex: number;
      readonly sheetName?: string | null;
      readonly originalPath?: string | null;
    }
  | {
      readonly kind: "unknown";
    };

export type RawTableRowsRecord =
  | {
      readonly kind: "inline";
      readonly values: readonly (readonly string[])[];
    }
  | {
      readonly kind: "normalizedCsv";
      readonly normalizedCsvPath: string;
      readonly formatVersion: number;
    };

export type RawTableRecord = {
  readonly fileId: string;
  readonly rawTableId: string;
  readonly source: RawTableSourceRecord;
  readonly rows: RawTableRowsRecord;
  readonly rowCount: number;
  readonly columnCount: number;
  readonly maxCellLengths?: readonly number[];
};
