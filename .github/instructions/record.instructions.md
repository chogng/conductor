---
description: Architecture documentation for CS recored, which is the canonical data record in session domain.
---

- session 领域里的 canonical data record，也就是可被长期持有、可被重建、可被其它模块读取的事实记录。
- 所以判断一个东西能不能叫 Record，看三点：

1. 它是不是业务事实，而不是临时 UI 状态。
2. 它是不是能从 session snapshot 里稳定读出来。
3. 它是不是会参与后续计算、导出、参数提取、chart/table 展示。

## 最终版设计
1. 一个 Excel 多个 sheet，每个 sheet 转一个 normalized CSV
2. 一个 raw table 里同时有 IV / CV
3. 一个 raw table 里有多个 block，每个 block 都是一套 IV 或 CV
4. Search 订阅和消费 session，但不刷新 canonical data
5. view state 不再放 SessionModel

```
SessionModel
  filesById
    FileRecord
      raw
        RawRecord
          rawTablesById
            RawTableRecord        // 原始表
      assessment
        candidatesById           // assessment 识别出的候选 block
      measurementBlocksById
        MeasurementBlockRecord   // 语义测量块：IV / CV / CF / PV / IT
      curvesByKey
      metricsByKey
```
一个 Excel 文件
  -> 一个 FileRecord
  -> 多个 RawTableRecord，每个 sheet 一个

一个 RawTableRecord
  -> 可以产生多个 MeasurementBlockRecord
  -> 每个 block 可以是 IV / CV / CF / PV / IT


FileRecord 不是“文件原始数据”，而是一个文件从导入到分析、模板、曲线、参数、缓存的完整生命周期容器。

```typescript
export type MeasurementBlockId = string;
export type CandidateId = string;
export type SeriesId = string;
export type CurveKey = string;
export type MetricKey = string;

export type BaseCurveFamily = "iv" | "cv" | "cf" | "pv" | "it";
export type IvCurveMode = "transfer" | "output";
export type ItCurveMode =
  | "stability"
  | "transient"
  | "retention"
  | "biasStress"
  | "photoResponse"
  | "generic";
```




## assessmentRecord
```typescript
export type AssessmentRecord = {
  // 文件级摘要，只是摘要，不代表整个文件只有一个 family。
  readonly summary?: {
    readonly detectedFamilies: readonly BaseCurveFamily[];
    readonly confidence?: "high" | "medium" | "low";
    readonly reasons?: readonly string[];
  };

  // assessment 真正重要的结果：
  // 识别出一个或多个候选 measurement blocks。
  readonly candidatesById: Record<CandidateId, BaseCandidateRecord>;
  readonly candidateOrder: CandidateId[];
};

export type BaseCandidateRecord = {
  readonly candidateId: CandidateId;
  readonly fileId: FileId;

  // 指向 raw table 的一个区域。
  readonly source: RawTableRangeRef;

  // 这个区域可能是什么测量类型。
  readonly baseFamily: BaseCurveFamily | null;
  readonly confidence?: "high" | "medium" | "low";
  readonly reasons?: readonly string[];

  // IV/IT 这种 family 自己的 mode。
  readonly ivMode?: IvCurveMode | null;
  readonly itMode?: ItCurveMode | null;
};
```

- 导入数据的本质是“把文件转换成表格”，所以 rawRecord 里以 table 为核心，记录了一个文件里有哪些表、每个表的结构和数据预览等信息。
- 一个 Excel 文件可能有多个 sheet，每个 sheet 都可能被转成一个 normalized CSV，所以normalizeCsvPath不要放到RawRecord上

## templateRunRecord
```typescript
type TemplateRunRecord = {
  selection: TemplateSelectionRecord;
  config: TemplateConfigRecord;
  input?: TemplateInputRecord;
  configFingerprint: string;
  mode: "auto" | "manual" | "rule";
  appliedAt: number;
  warnings: string[];
  errors: string[];
};
```
- 记录“这次 template 是怎么应用的”，包括选择方式、配置、输入范围、配置指纹、模式、时间、warning 和 error

## Guidelines

### Forbidden to do
- 凡是“这个文件自己的事实数据”，放进 FileRecord。
- 凡是“某个 view 怎么显示它”，不要放进 FileRecord。
- 凡是“某个 service 的 worker/cache/request 生命周期”，不要放进 FileRecord。


