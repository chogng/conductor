

## IExplorerService

`src/cs/workbench/services/files/common/files.ts` 定义了 IExplorerService 接口，提供文件导入、文件引用、CSV/Excel/Clipboard 转 RawTableRecord 的功能。

Excel 一个 workbook -> 一个 FileRecord。
Excel 每个 sheet -> 一个 RawTableRecord。
normalized CSV 路径挂在 RawTableRecord.rows，不挂在 RawRecord。
IExplorerService 不识别 IV/CV/block，不判断 sweep mode。

## 

### fileRecord

```typescript
export type FileRecord = {
  readonly id: FileId;

  // 原始文件和原始表格
  readonly raw: RawRecord;

  // assessment 的预处理判断结果
  readonly assessment: AssessmentRecord;

  // 一个文件内可以有多个 measurement blocks。
  // 一个 raw table 内也可以有多个 measurement blocks。
  readonly measurementBlocksById: Record<MeasurementBlockId, MeasurementBlockRecord>;
  readonly measurementBlockOrder: MeasurementBlockId[];

  // flattened index，方便 chart / parameters / export / search 快速读取。
  readonly curvesByKey: Record<CurveKey, CurveRecord>;
  readonly metricsByKey: Record<MetricKey, MetricRecord>;

  readonly metricsBySeriesId?: Record<SeriesId, readonly MetricKey[]>;
  readonly metricInputsByKey?: Record<MetricKey, MetricInputRecord>;

  //  可选计算缓存，随 file/block/curve signature 失效
  readonly calculationCache?: CalculationCacheRecord;
};
```

### rawRecord

```typescript
export type FileId = string;
export type RawTableId = string;

export type RawRecord = {
  readonly fileId: FileId;
  readonly fileName: string;

  // 原始文件事实
  readonly rawFile?: unknown;
  readonly size?: number;
  readonly lastModified?: number;
  readonly rawKey?: string;
  readonly relativePath?: string | null;
  readonly filePath?: string | null;

  // 一个文件里解析出来的原始表格
  // CSV 通常只有一个 RawTableRecord。
  // Excel 通常每个 sheet 对应一个 RawTableRecord。
  readonly rawtablesById: Record<RawTableId, RawTableRecord>;
  readonly rawtableOrder: RawTableId[];
};
```
- 原因：Excel 多 sheet 时，每个 sheet 都可能对应一个 normalized CSV。路径必须挂在每个 RawTableRecord.rows 上。

### rawTableRecord

```typescript
export type RawTableRecord = {
  readonly fileId: FileId;
  readonly rawTableId: RawTableId;

  // 这个raw table 从哪里来
  readonly source: RawTableSourceRecord;

  // 这张 raw table 的 rows 存在哪里
  readonly rows: RawTableRowsRecord;
  
  // 这张 row table 自己的size
  readonly rowCount: number;
  readonly columnCount: number;

  // 可选但建议保留。主要给 TableService / preview 估算列宽。
  // 不参与 assessment/template/calculation。
  readonly maxCellLengths: readonly number[];
};
```

### rawTableSourceRecord

```typescript
export type RawTableSourceRecord =
  | {
      readonly kind: "csv";
    }
  | {
      // 用于多sheet切片为单独csv文件 
      readonly kind: "excelSheet";

      // Excel workbook 内 sheet 顺序
      readonly sheetIndex: number;

      // Excel sheet name
      readonly sheetName?: string | null;
    };
```
- 这里仍然是type alias
- 未来加入clipboard来源
```typescript
export type RawTableSourceRecord =
  | { readonly kind: "csv" }
  | {
      readonly kind: "excelSheet";
      readonly sheetIndex: number;
      readonly sheetName?: string | null;
    }
  | {
      readonly kind: "clipboard";
      readonly pastedAt: number;
      readonly label?: string | null;
    };
```

### rawTableRowsRecord

- 设计上，rows 既可以是 inline 的，也可以是一个外部文件路径，供 TableService 预览和计算使用，但不直接放在 sessionModel 里。
```typescript

export type RawTableRowsRecord =
  | {
      // rows 直接存在 session 里
      // 适合小文件、测试数据
      readonly kind: "inline";
      readonly values: readonly TableRowRecord[];
    }
  | {
      // rows 已经被标准化成内部 CSV
      // 适合 xls/xlsx -> one sheet one csv、大文件、按需读取
      readonly kind: "normalizedCsv";
      readonly normalizedCsvPath: string;
      readonly formatVersion: 1;
    };
export type TableRowRecord = readonly unknown[];
```

### rawTableRangeRef

- 设计Range引用
- 一表中多类型数据的情况，比如1 - n行是IV,n+1 - 2n起是CV数据，亦或者前面是一套IV，后面是另一套IV

```typescript
/**
 * All indexes are zero-based and inclusive.
 *
 * startRow/endRow refer to raw table row indexes.
 * startCol/endCol refer to raw table column indexes.
 */
export type RangeRef = {
  readonly startRow: number;
  readonly endRow: number;
  readonly startCol: number;
  readonly endCol: number;
};

export type RawTableRangeRef = {
  readonly fileId: FileId;
  readonly rawTableId: RawTableId;
  readonly range: RangeRef;
};
```