# Session 模型契约

这份文档定义目标 session 数据模型。目标模型从 `SessionModel` 和 `FileRecord` 开始，而不是从当前顶层 state collections 开始。当前这些 collections 只属于 legacy storage compatibility；它们会在后文列出，目的是让迁移代码把它们隔离在 session service 边界。

核心规则是：一个导入文件对应一个 `FileRecord`，后续每个阶段都写入这个 record 下职责明确的位置。不要把同一个文件的 source、cleaned series、curve metadata、calculated curves、metrics 和 view state 分散给互不相关的 owner。

## 执行标准

这份文档是实现标准，不是背景说明。修改 session model 代码时，要么遵守这份契约，要么先更新这份契约，把新的 owner、生命周期和失效规则写清楚。

代码评审按这张表检查：

| 问题 | 必须回答 |
| --- | --- |
| 字段由哪个对象拥有？ | 字段必须属于 `SessionModel`、某个 `FileRecord`，或这个 `FileRecord` 下具名的子对象。 |
| 这是领域数据还是 view state？ | 领域数据放到 file model 下；纯 UI 状态放到 `SessionViewState`。 |
| 这是 selection 还是 preview？ | 持久化 selection。Preview 是 view 对 selection 的反应。 |
| 什么会让这个值失效？ | 每个 cleaned record、curve、metric、cache 和 view model 都必须有明确上游依赖。 |
| 这是 legacy compatibility 吗？ | Legacy storage collections 只在 `SessionService` 边界映射；新功能代码不能把这些名字当成领域词汇继续使用。 |

## 模型图

```ts
type SessionModel = {
  filesById: Record<string, FileRecord>;
  fileOrder: string[];
  selection: SessionSelection;
  viewState: SessionViewState;
};

type FileRecord = {
  id: string;
  source: SourceRecord;
  assessment: CurveAssessment;
  sheetsById: Record<string, SheetRecord>;
  template?: TemplateRunRecord;
  cleaned?: CleanedRecord;
  curves: CurveStore;
  metrics: MetricStore;
  analysisCache?: AnalysisCacheRecord;
};
```

`SessionModel` 是 workbench 当前数据表唯一应该被当作 durable data table 的对象。`FileRecord` 是血缘单位。如果一段代码回答不了“这个字段属于哪个 `FileRecord`”，这个字段大概率放错了。

## 核心对象

| 对象 | 职责 | 核心属性 | 不能拥有 |
| --- | --- | --- | --- |
| `SessionModel` | 当前数据工作区。 | `filesById`、`fileOrder`、`selection`、`viewState`。 | 原始 `File` 解析细节、curve points、metric algorithms。 |
| `FileRecord` | 一个导入文件的完整生命周期。 | `id`、`source`、`assessment`、`sheetsById`、`template`、`cleaned`、`curves`、`metrics`、`analysisCache`。 | UI-only selection 或 scroll state。 |
| `SourceRecord` | 原始导入事实。 | `fileId`、`file`、`fileName`、`size`、`lastModified`、`sourceKey`、`relativePath`、`sourcePath`、`normalizedCsvPath`。 | Cleaned arrays、calculated curves、用户可见 metric rows。 |
| `SheetRecord` | 文件里可预览的表格源。 | `fileId`、`sheetId`、`sheetName`、`sourceKey`、`rowCount`、`columnCount`、`maxCellLengths`。 | Row cache owner 或 template result data。 |
| `CurveAssessment` | 模板清洗前后的早期曲线分类。 | `curveType`、`curveTypeConfidence`、`curveTypeNeedsTemplate`、`curveTypeReasons`、`xAxisRole`、`xAxisRoleSource`、`supportsSs`。 | Numeric curve points 或 derived metrics。 |
| `TemplateRunRecord` | 产出 `cleaned` 的模板选择和 extraction run。 | `selection`、`configFingerprint`、`templateId`、`mode`、`appliedAt`、`warnings`、`errors`。 | Cleaned series data 或 preview selection state。 |
| `CleanedRecord` | 模板清洗后的科学源数据。 | `fileId`、`axis`、`domain`、`xGroups`、`seriesById`、`seriesOrder`、`sampledPoints`。 | 原始 browser `File`、chart color、hidden state。 |
| `SeriesRecord` | 一条 cleaned source series。 | `id`、`name`、`legendValue`、`groupIndex`、`yCol`、`y`、`labelOverride`。 | Derived gm/SS/Vth points 或 per-curve visual state。 |
| `CurveStore` | 一个文件的 source 和 derived drawable curves。 | `byKey`，key 是 `curveKind + seriesId`；每个 `CurveRecord` 有 `fileId`、`seriesId`、`curveKind`、`points`、`domain`、`signature`、`source`。 | File-level axis meaning 或用户 metric inputs。 |
| `MetricStore` | Per-series calculation / inspector values。 | `bySeriesId`；每个 `MetricRecord` 可包含 `ion`、`ioff`、`ionIoff`、`gmMaxAbs`、`vth`、`ss`、confidence、windows 和 method metadata。 | Raw points、template config、chart-only state。 |
| `AnalysisCacheRecord` | 可选的重计算加速缓存。 | `fileId`、`touchedAt`、`estimatedBytes`、兼容 per-series cache，例如 `baseCurrent`、`gm`、`ss`、`ssFitAuto`。 | Canonical cleaned model；cache 可以随时被 prune。 |
| `SessionSelection` | 当前用户选中状态。 | `fileId`、`sheetId`、`seriesId`、`curveKind`、`cell`、`range`。 | `preview` 这个词。选中可以触发表格预览，但预览是 view 行为。 |
| `SessionViewState` | 纯 UI 状态。 | Table row cache refs、expanded ids、hidden curves、colors、scroll/reveal state、loading status。 | 科学元数据、计算值、source file identity。 |

## 对象字段

| 对象 | 字段 | 含义 |
| --- | --- | --- |
| `SourceRecord` | `fileId` | 文件进入 session 时创建的稳定 id。后续所有阶段都链接回它。 |
| `SourceRecord` | `sourceKey` | 由 name / size / mtime / path 得到的稳定源身份，用于检测外部变化和缓存 preview work。 |
| `SourceRecord` | `normalizedCsvPath` | Excel 或需要归一化的源文件转换出的 CSV 路径。 |
| `CurveAssessment` | `curveType` | 曲线分类，例如 transfer、output、cv、cf、pv、unknown，或未来新增的领域类型。 |
| `CurveAssessment` | `xAxisRole` | 科学 x 轴角色，例如 `vg` 或 `vd`；它应该指导 template、metrics 和 labels。 |
| `CleanedRecord` | `axis` | 清洗后的 axis labels、roles、units 和 y scale。它替代含糊的 file-level `metadata`。 |
| `CleanedRecord` | `xGroups` | 清洗后的 x arrays。`SeriesRecord.groupIndex` 选择匹配的 x group。 |
| `SeriesRecord` | `id` | 稳定 source series id。派生 IV/gm/SS/Vth 曲线必须保留这条血缘。 |
| `SeriesRecord` | `legendValue` | 模板生成的 legend label，例如某个 bias value。 |
| `CurveRecord` | `curveKind` | `iv`、`gm`、`ss`、`vth`、`secondDerivative`，或其他明确 curve kind。 |
| `CurveRecord` | `source` | 这条曲线的直接输入，例如 cleaned source points 或 first-pass gm curve。 |
| `CurveRecord` | `signature` | 数值点和语义输入的 hash/version。下游 cache 用它判断是否失效。 |
| `MetricRecord` | `current` | Ion/Ioff 值、x positions、ratio、method 和 candidate windows。 |
| `MetricRecord` | `derivative` | gm 或 gds extrema 和 x positions。 |
| `MetricRecord` | `threshold` | Vth values、branch labels、fit quality 和 source curve signature。 |
| `MetricRecord` | `subthreshold` | SS value、confidence、x range、fit metadata 和 manual/auto method。 |
| `SessionSelection` | `fileId` | 被选文件。如果表格展示它，那是 table behavior，不是另一个 preview selection。 |
| `SessionSelection` | `sheetId` | 文件内被选 sheet/source。 |
| `SessionSelection` | `seriesId` | 被选 cleaned source series，如果当前 workflow 需要。 |
| `SessionSelection` | `curveKind` | chart / inspector workflow 里被选的 curve kind。 |

## 流程

| 步骤 | 输入 | 写入 | 失效 |
| --- | --- | --- | --- |
| 导入 source | File picker、folder scan、workspace watcher。 | `FileRecord.source`、初始 `assessment`、可选 `sheetsById`。 | 此时没有下游。 |
| 选择 file 或 sheet | 用户选择。 | `SessionSelection.fileId`、`SessionSelection.sheetId`。 | 只让 table row requests 和 view caches 失效。 |
| 分类或重命名 series | Import assessment、浮层标签 UI、用户 label edit。 | `assessment`、`SeriesRecord.labelOverride`。 | Template suggestion、chart legend text、metric row labels。 |
| 应用模板 | `SourceRecord`、selected sheet rows、`TemplateRunRecord` config。 | `template`、`cleaned`、如果产出则写 `analysisCache`。 | `curves`、`metrics`、inspector views、基于旧 cleaned data 的 exports。 |
| 一次计算 | `CleanedRecord`。 | `curves.byKey` 中的 IV/gm/SS/Vth 和 signatures。 | 消费旧 curve signatures 的 metrics 和 second-pass curves。 |
| Metric 计算 | `CleanedRecord`、first-pass curves、manual metric inputs。 | `metrics.bySeriesId`。 | Parameter / inspector read models 和 exports。 |
| 二次计算 | 被选中的 first-pass `CurveRecord`。 | 另一条明确的 `CurveRecord`，`curveKind: "secondDerivative"` 或 feature-specific kind。 | 只让这条二次曲线的 consumers 失效。 |
| 渲染 table/chart/parameters | `SessionModel` snapshot。 | 只写 `SessionViewState`。 | 不影响 domain data。 |

## Legacy 隔离

这些名字描述的是当前存储形状，不是目标模型。不要新增代码把它们当概念 owner 使用。迁移期间它们可以存在于 `SessionService` 后面，但每一次读写都必须能用目标 owner 解释。

| Legacy 字段 | 目标 owner | 隔离规则 |
| --- | --- | --- |
| `sourceFiles[]` | `FileRecord.source` 加初始 `assessment` | 现在它混了 raw/import/assessment。只把它当导入兼容层。 |
| `selectedPreviewFileId` | `SessionSelection.fileId` | 概念上应该改名。选中导致 preview，domain 字段名里不应该有 preview。 |
| `selectedPreviewSheetId` | `SessionSelection.sheetId` | 和 file selection 同理。 |
| `previewFile` | `FileRecord.sheetsById[sheetId]` 加 `SessionViewState.table` | Dimensions 属于 sheet/table source；row caches 和 loading 属于 view state。 |
| `cleanedData[]` | `FileRecord.cleaned` | 应按 `fileId` 归一化，不应作为无归属的顶层数组长期存在。 |
| `metadata.filesById` | `CleanedRecord.axis` 和 file semantic fields | 把含糊的 metadata 拆成 typed axis/template/source semantics。 |
| `metadata.curvesByKey` | `FileRecord.curves.byKey` | 曲线属于产生它的源 series 所在文件。 |
| `metadata.seriesLabelsByFileId` | `SeriesRecord.labelOverride` | Label override 是 source series state，不是 global metadata。 |
| `metadata.curveViewStateByKey` | `SessionViewState.curves` | Color 和 hidden 是视觉状态。 |
| `calculatedDataByKey` | `FileRecord.curves` | 它是 curve store/read model，不是独立顶层领域表。 |
| `analysisResults` | `FileRecord.analysisCache` 或 `FileRecord.metrics` | 这个名字本身含糊。Cache 和最终 metric records 必须先拆开，新代码才能消费。 |
| `ionIoffManualTargetsByFileId` | `MetricStore` 下的 metric input state，或单独 metric settings object | Manual inputs 不是最终 metric values。 |
| `ssManualRanges` | `MetricStore` 下的 metric input state，或单独 metric settings object | 和 current targets 同理。 |

## 规则

| 规则 | 必须遵守的行为 |
| --- | --- |
| 一个导入文件一个对象 | 一个文件的 source、assessment、cleaned data、curves、metrics 和 cache 必须能从同一个 `FileRecord` 到达。 |
| Selection 不是 preview | 使用 `selection.fileId` 和 `selection.sheetId`。Preview 是 table 对 selection 的反应。 |
| View state 不是科学数据 | Colors、hidden flags、scroll、loading、row caches、reveal targets 都留在 `SessionViewState`。 |
| 曲线保留血缘 | 每个 `CurveRecord` 必须带 `fileId`、`seriesId`、`curveKind`、`source` 和 `signature`。 |
| Metrics 是 records，不是 table cells | Ion/Ioff/gm/Vth/SS/inspector values 属于 `MetricRecord`；UI tables 只是 read models。 |
| Cache 可丢弃 | `analysisCache` 可以加速重算，但正确性不能依赖它存在。 |
| 按依赖失效 | Template changes 让 cleaned descendants 失效；curve signature changes 让 metrics 和 second-pass curves 失效；view changes 不让 domain data 失效。 |
| 避免含糊 bucket | 不要新增叫 `metadata`、`data`、`result`、`cache`、`state` 的顶层对象，除非 owner 和 lifecycle 已经明确。 |
| Service boundary 负责兼容 | legacy fields 还存在期间，`SessionService` 应该是唯一负责在 legacy fields 和目标模型之间转换的地方。 |

## 验收清单

Session model 改动合入前必须检查：

| 检查项 | 通过条件 |
| --- | --- |
| 对象边界 | 新增或迁移字段放在最小 owning object 下，通常是 `FileRecord` 或它的子 record。 |
| 命名 | 字段名表达领域 owner，不用 preview 这类 view 行为命名，除非字段确实是 view state。 |
| 血缘 | Cleaned data、curves、metrics、cache entries 都能追溯到 `fileId`，需要时还能追溯到 `seriesId` 和 `curveKind`。 |
| 失效 | Patch 说明或实现 source、template、curve signature、metric input、selection 变化时哪些数据被清理或重算。 |
| 兼容 | 现有 legacy storage 写入要么被保留在 `SessionService` 后面，要么明确迁移到目标 owner。新 feature API 不暴露 legacy bucket 名字。 |
| Views | Table/chart/parameter views 只消费 model snapshots，并只写 `SessionViewState` 或明确的用户输入。 |
