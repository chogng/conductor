重要：用户以中文版为主进行更新，英文以中文为主进行更新同步，不要修改中文版

# DataResource 证据算法

这份文档说明表格测量数据的目标算法边界。核心结论是：

```txt
DataResource = 分块、特征提取、候选生成
Review       = 候选评估、排序、是否推荐
```

也就是说，DataResource 不应该只靠表头文本猜测列角色；它应该从真实数值结构里生成证据。Review 再消费这些证据，判断哪个候选足够可信，是否可以自动推荐并生成可执行 Template。

## 问题

测量数据文件常见三种形态：

1. 第一行就是列标签，后面直接是数值数据；
2. 前面有一大块 metadata / 信息块，后面才是真正的数据区。
3. 完全没有 metadata 或列标签，文件从第一行就直接进入数值数据。

这里需要把概念分清楚：metadata 信息块不等于表头。它可能包含测试设置、通道名称、sweep 参数、graph 设置、仪器备注等内容，但它不是用于执行取数的 header row。

第三种 headerless numeric data 更难，因为它没有任何 semantic hints。它仍然应该能被评估：DataResource 可以从 numeric runs、fixed-step X-like ranges、行对齐的 Y-like ranges 和 binding candidates 里生成证据。Review 在没有名称和单位时应该降低语义置信度，但不应该把这类文件当成“数据没拿到”。

因此算法不应该先问“这个表头在哪”。更稳的顺序是：

```txt
先找连续数值区
  -> 再找像 X 的 range
  -> 再找像 Y 的 range
  -> 再生成 X/Y 绑定候选
```

当前 recipes + review 无法评估一些文件时，根因通常不是 Slice 切错了。Slice 只能执行已经 review 通过的 Template。如果 Review 产不出推荐结果，更可能是 Review 前面的 structured evidence 不完整：没有可靠产出 data region、X range、dependent value columns 或 X/value binding。

## 责任边界

```txt
Table
  -> 只解析物理 rows / cells

DataResource
  -> 分割 numeric regions
  -> 生成 XRangeCandidate
  -> 生成 DependentValueCandidate
  -> 生成 BindingCandidate
  -> 输出带 confidence / reasons 的 structured evidence

Recipe
  -> 被动描述对 structured evidence 的期望

Review
  -> 评估候选
  -> 排序和处理歧义
  -> 决定 ready / needs adjustment / invalid
  -> ready 时 materialize ReviewedTemplate

Template
  -> 保存用户确认后的可执行 ranges 和 axis bindings

Slice
  -> 只执行 ReviewedTemplate
```

`dataRange` 不是算法本身。它是分块算法的一个输出：哪一段连续单元格区域是真正可用的数据区。

Review 不应该重新扫描 raw rows 去发现 `dataRange`。Slice 也不应该推断 header、role 或 layout。

## 核心判断

固定 step 不是 X 的定义，但它是测试数据里识别 X range 的高置信特征。

测试仪器里的 sweep 通常来自：

```txt
start / stop / step
start / stop / points
```

导出到表格后，X 列经常表现为：

- 长连续 numeric 序列；
- 单调递增或递减；
- 相邻差值高度稳定；
- repeated sweep block 里出现分段固定 step；
- 多个 block 或相邻 X/Y pair 中 pattern 重复；
- 在行维度上和一个或多个 dependent value columns 对齐。

因此可以形成一个强判断：

```txt
fixed-step numeric sequence
  -> strong X range candidate
```

但这仍然只是候选，不是最终结论。DataResource 负责产出这个候选；Review 负责判断它是否应该成为最终 X。

第二类高置信信息来自局部 title / info row。对于一个连续 numeric run，如果它上方最近的 title/info cell 命中信息库，那么这个 title 下方同列的连续数据基本继承该 title 的数据类型。

典型结构：

```txt
row n:   Vg
row n+1: -1.0
row n+2: -0.9
...
```

这里 `row n+1..` 的同列 numeric run 可以被强标注为 `Vg` 数据。title 不能无限向下覆盖，它应该只覆盖同列下方的连续 numeric run，并在空行、明显非 numeric block、下一个 title/info row、重复 block 边界或列结构断裂处停止。

如果 X 自身 fixed-step / monotonic 证据很强，title evidence 是加强项。如果 X 的 step 不规律，title evidence 就变成第二类高置信证据：`Vg`、`Vd`、`time`、`frequency`、`bias` 这类 title 可以把对应 numeric run 提升为 X candidate；`Id`、`Ig`、`capacitance` 这类 title 则更倾向于 dependent value。

这要求 DataResource 有一个可快速匹配的 canonical title library。它不属于 Recipe，也不应该临时写在 Review scoring 里。DataResource 负责把 title match 产成 structured evidence，Review 再消费它。

## 候选模型

DataResource 应该输出描述证据的候选，而不是最终决策。

```ts
type XRangeCandidate = {
  readonly column: number;
  readonly startRow: number;
  readonly endRow: number;
  readonly direction: "ascending" | "descending" | "mixed";
  readonly stepKind: "constant" | "nearlyConstant" | "pointsDerived" | "segmentedConstant";
  readonly step?: number;
  readonly pointCount: number;
  readonly confidence: number;
  readonly reasons: readonly string[];
};
```

```ts
type DependentValueCandidate = {
  readonly column: number;
  readonly xRangeCandidateIds: readonly string[];
  readonly numericCoverage: number;
  readonly confidence: number;
  readonly reasons: readonly string[];
};
```

```ts
type ColumnTitleSpanEvidence = {
  readonly titleCell: {
    readonly row: number;
    readonly column: number;
    readonly text: string;
  };
  readonly targetColumn: number;
  readonly startRow: number;
  readonly endRow: number;
  readonly normalizedTitle: string;
  readonly canonicalRole: "vg" | "vd" | "id" | "time" | "frequency" | "capacitance" | string;
  readonly canonicalUnit?: "V" | "A" | "s" | "Hz" | "F" | string;
  readonly axisTendency: "x" | "dependent" | "unknown";
  readonly confidence: number;
  readonly reasons: readonly string[];
};
```

```ts
type BindingCandidate = {
  readonly xRangeCandidateIds: readonly string[];
  readonly dependentValueCandidateIds: readonly string[];
  readonly relation:
    | "oneX-oneY"
    | "oneX-manyY"
    | "manyXYpairs"
    | "segmentedSweep"
    | "matrixEncoded";
  readonly confidence: number;
  readonly ambiguityCodes: readonly string[];
  readonly reasons: readonly string[];
};
```

`xy`、`xyyyy`、`xyxyxy` 这类 layout taxonomy 应该是对 BindingCandidate 的后验解释，不应该是算法最先分类的目标。

## 检测流程

```txt
raw table rows
  -> normalize cells
  -> find continuous numeric runs
  -> match nearby column title spans through the title library
  -> group compatible runs into data regions
  -> score XRangeCandidate values
  -> collect DependentValueCandidate values inside X ranges
  -> generate BindingCandidate values
  -> expose structured evidence
  -> Review evaluates evidence and materializes Template
```

### Numeric Runs

第一轮应该按列和行扫描连续 numeric runs。每个 run 至少记录：

- start row / end row；
- numeric coverage；
- 空值密度；
- finite number count；
- 单调性；
- 相邻 delta 分布；
- repeated pattern signature；
- 如果存在，关联 source header 或 metadata 引用。

这一步天然会跳过大的 metadata block，因为那些行不会形成长连续数值 run。

### Column Title Span 匹配

对每个 numeric run，DataResource 应该向上查找最近的 title/info evidence。最常见的是 numeric run 上一行：这一行的第一个单元格可能是信息行 marker，例如 `DataName`，同一行后续各列 cell 才是列 title；也可能第一格本身就是单列或 block title。

因此匹配时先识别 row-level info marker，再按目标列读取同一行的 column title。没有 row marker 时，再查找同列上方最近的非空 title cell。在信息块场景下，可以允许有限距离内的最近 title，但不能跨过下一个 numeric/data block。

匹配流程：

```txt
numeric run
  -> inspect the row immediately above the run
  -> if the row has an info marker, read the title cell at the target column
  -> otherwise find nearest title/info cell above the same column
  -> normalize title
  -> lookup canonical title library
  -> emit ColumnTitleSpanEvidence
```

信息库需要覆盖常见别名：

```txt
Vg / Vgs / Gate Voltage
  -> role: vg, unit: V, axisTendency: x

Vd / Vds / Drain Voltage
  -> role: vd, unit: V, axisTendency: x

Id / Ids / Drain Current
  -> role: id, unit: A, axisTendency: dependent

time / frequency / bias
  -> role: time/frequency/voltage, axisTendency: x

Cgg / capacitance
  -> role: capacitance, unit: F, axisTendency: dependent
```

title span 的覆盖范围由它下方同列的连续 numeric run 决定。它应该在这些位置停止：

- 空行；
- 明显非 numeric block；
- 下一个 title/info row；
- repeated block 边界；
- 列结构断裂。

title evidence 能强判列的数据类型，但不应该绕过 numeric run 直接制造切片范围。最终 row start / row end 仍然来自被选中的 XRangeCandidate。

### X Range 打分

正向证据：

- numeric coverage 高；
- 空值少；
- 单调方向明确；
- adjacent delta 方差低；
- 存在 segmented constant-step 行为；
- 在 block 或相邻 pair columns 中 pattern 重复；
- header / unit 命中 `Vg`、`Vd`、`time`、`frequency`、`bias` 等 X 语义；
- 上方同列 title/info cell 命中 X-like canonical role；
- 和附近 dependent value candidate 在行维度对齐。

负向证据：

- 点数太少；
- 数值完全像物理行号或 sample index；
- 列更像 metadata、id、group 或 label；
- 序列是常量；
- 没有合理的对齐 dependent value column。

重要边界：Y 列也可能单调，甚至局部近似线性。所以 fixed step 不能单独把一列定死为最终 X。

### Dependent Value 候选

切片 row range、row start / row end、segmentation 都应该由 XRangeCandidate 决定。Y 不负责决定切哪里。

因此这里不应该建模成独立的 `YRangeCandidate`。更准确的名字是 `DependentValueCandidate`：在某个 X range 的 row span 内，这一列可以作为 dependent values 被读取。

Y 的曲线形状不应该成为强置信来源。很多测量文件里，Y 可能是 current、capacitance、conductance 或 derived value，它可能非线性、有噪声、局部单调、近似线性、跨零、变号，甚至在部分区间接近平坦。

所以 dependent value 检测应该更宽松：形态最多用于排除明显无效的列，而不是证明某列就是 Y。非 fixed-step 或非单调不足以证明某列是 Y；单调或近似线性也不足以把某列排除为 Y。

这里的 confidence 表示“这个列在某个 X range 内是否可作为 dependent values 读取”，不表示它能帮助决定切片范围。

正向证据：

- row span 由绑定的 X range 决定；
- numeric coverage 高；
- 物理位置邻近 X，或者跟在 shared X 后面；
- header / unit 命中 current、capacitance 等测量值语义；
- 上方同列 title/info cell 命中 dependent-like canonical role；
- 数值不像 row index 或重复 sweep 参数。

### Binding 生成

Binding 应该在 XRangeCandidate 和 DependentValueCandidate 都存在之后生成。

例子：

```txt
X Y
  -> oneX-oneY

X Y Y Y Y
  -> oneX-manyY

X Y X Y X Y
  -> manyXYpairs

block: X Y
block: X Y
  -> segmentedSweep or repeated blocks
```

如果多个 X 列完全相同，不应该降低“它们是 X range”的置信度。真正的歧义在绑定层：Review 需要判断这份数据应该按 repeated pairwise X/value bindings 执行，还是 collapse 成一个 shared X + many dependent value columns。

## Review 评估

Review 消费 evidence，然后决定：

- 哪个 binding candidate 最符合当前文件；
- 候选是否足够明确，可以自动推荐；
- 是否因为歧义需要用户确认；
- 最终应该生成哪个可执行 Template。

Review 可以使用：

- DataResource 给出的 binding confidence；
- ColumnTitleSpanEvidence 给出的 role / unit / axis tendency；
- recipe 期望；
- semantic roles 和 units；
- parser diagnostics；
- ambiguity codes；
- user templates 或 confirmed schema profiles；
- stale / source-version checks。

Review 不应该重新扫描 raw rows，也不应该重建 numeric-run evidence。

## Template 输出

最终 Template 应该保存可执行取数规则，而不是算法内部的 layout taxonomy。

重要输出事实是：

- X columns 和 X ranges；
- dependent / Y columns；
- row range；
- segmentation；
- measurement binding；
- applicability fingerprint。

`xy`、`xyyyy`、`xyxyxy` 可以继续作为 Review 或 Recipe 的词汇，但执行链路应该由明确的 X ranges 和 axis bindings 驱动。Y 的读取范围来自绑定的 X range，不应该单独决定切片。

## 边界场景

- Y 列可能近似线性和单调。
- row index / sample number 列可能看起来像 fixed-step X。
- 一个文件里可能有多个 segmented sweeps。
- pairwise 文件可能有多个独立 X 列。
- wide matrix 的真实 X 可能在 metadata 或列标题里，而不是某个物理数据列。
- 第一行就是表头的文件可能完全没有 metadata block。
- headerless numeric 文件可能从 row 0 直接开始，没有列名、单位或 metadata 引用。
- Origin 风格文件可能有几百行 metadata，然后才出现 `DataName` / `DataValue`。
- title/info row 可能是 `DataName,Vg,Id,...` 这种 row marker + per-column title 形式，而不是简单的单元格表头。
- 文件扩展名可能错误，例如二进制 XLSX 内容被保存成 `.csv`。这是 parser / input 问题，不是 Review scoring 问题。

## 测试策略

至少要覆盖这些形态：

- 第一行 `X,Y`；
- 第一行 `X,Y,Y,Y`；
- 第一行 `X,Y,X,Y` pairwise；
- 从 row 0 直接开始的 headerless numeric-only `X,Y`；
- 从 row 0 直接开始的 headerless numeric-only `X,Y,Y,Y` 和 `X,Y,X,Y`；
- 长 metadata block 后出现 `DataName` 和 numeric `DataValue`；
- 每段是 fixed step，但整列不是全局 fixed step 的 segmented sweeps；
- X step 不规律，但上方 title/info row 命中 `Vg` / `Vd` / `time` / `frequency`；
- `DataName,Vg,Id,...` 这类 row marker + per-column title；
- 看起来像 row index 的列；
- 单调 Y 不能压过更强 X candidate；
- Y 的曲线形状不能改变 slice row start / row end；
- malformed 或扩展名错误的输入文件。

测试应该同时断言 DataResource 产出的 candidates 和 Review 最终 decision。这样可以保持边界清楚：DataResource 负责证据，Review 负责评估。
