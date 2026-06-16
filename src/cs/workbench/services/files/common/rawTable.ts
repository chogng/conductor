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

export type RawTableHealthState =
  | "ok"
  | "suspect"
  | "decodeFailed"
  | "parseFailed"
  | "unsupported"
  | "empty";

export type TemplateEligibility =
  | "eligible"
  | "notEligible"
  | "needsUserAction";

export type RawTableHealthRecord = {
  readonly state: RawTableHealthState;
  readonly message: string;
  readonly decode?: {
    readonly encoding?: string;
    readonly confidence: number;
    readonly replacementCharRatio: number;
    readonly controlCharRatio: number;
    readonly binaryLike: boolean;
    readonly reason?: string;
  };
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
    }
  | {
      readonly kind: "unavailable";
      readonly reason: string;
    };

export type RawTableRecord = {
  readonly fileId: string;
  readonly rawTableId: string;
  readonly source: RawTableSourceRecord;
  readonly rows: RawTableRowsRecord;
  readonly rowCount: number;
  readonly columnCount: number;
  readonly maxCellLengths?: readonly number[];
  readonly health?: RawTableHealthRecord;
  readonly templateEligibility?: TemplateEligibility;
};
