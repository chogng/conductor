# Recipes

Recipe 是内置的、可读的 Review 候选切分说明。它不直接生成最终
Template，也不决定 ready / needsAdjustment / invalid。Review 负责把
Recipe 套到当前 `ReviewEvidence` 上，生成 `ReviewCandidate`，再评分。

修改 recipe 时按这个顺序定位问题：

```txt
dataRange
  -> blockPartition
  -> withinBlock.physicalLayout
  -> seriesPartition
  -> logicalRelation
  -> variants / domain / roles
  -> Review scoring
```

## 字段

`dataRange` 回答“数据范围在哪里”。当前只使用：

```json
{ "kind": "detectedDataRegion" }
```

`blockPartition` 回答“能不能按 measurement block 分、取哪些 block”：

```json
{
  "kind": "measurementBlocks",
  "select": "each",
  "minConfidence": 0.75
}
```

`select: "each"` 表示每个匹配 block 都生成候选；`select: "first"` 表示只取
第一个匹配 block，适合一个表内已经带 group 列、需要在块内继续拆曲线的形态。

`withinBlock.physicalLayout` 只描述块内物理列排布，不描述测量语义，也不描述是否
按 group 拆分：

| Layout | 含义 |
| --- | --- |
| `xy` | 一列 X，一列 Y。 |
| `xyyyy` | 一列 X，多列 Y。单 Y 也可以由 Review 低风险接受。 |
| `xyxyxy` | 多组相邻 X/Y pair。 |
| `blocks.xy` | 多个 block，每个 block 内是 `xy`。 |
| `blocks.xyyyy` | 多个 block，每个 block 内是 `xyyyy`。 |

`seriesPartition` 回答“一个物理 block 内是否还要继续拆多条曲线”：

| Partition | 含义 |
| --- | --- |
| `{ "kind": "none" }` | 不按额外 group 列拆分。 |
| `{ "kind": "groupColumn", "layoutKind": "groupedSweep" }` | X/Y 仍是 `xy`，但表内还有 group/bias/point/label 等列参与拆分。Review 通过 layout binding 找到 X/Y 和 group 的关系。 |

因此，带 group 列的 IV sweep 不是新的 physical layout；它是：

```json
{
  "withinBlock": {
    "physicalLayout": "xy",
    "rowRange": "block.dataRange"
  },
  "seriesPartition": {
    "kind": "groupColumn",
    "layoutKind": "groupedSweep",
    "minConfidence": 0.75
  },
  "logicalRelation": "oneX-oneY-manyGroups"
}
```

`logicalRelation` 描述切出来的曲线关系：

| Relation | 含义 |
| --- | --- |
| `oneX-oneY` | 一个 X 对一个 Y。 |
| `oneX-manyY` | 一个 X 对多个 Y。 |
| `oneX-oneY-manyGroups` | 一个 X/Y pair，按 group 拆多条曲线。 |
| `manyXYpairs` | 多个 X/Y pair。 |
| `manyBlocks-oneX-oneY` | 多个 block，每个 block 贡献一条 X/Y 曲线。 |

`domain` 和 `roles` 是语义约束。它们应该放在物理切分之后使用：

```json
{
  "domain": {
    "family": "iv",
    "ivMode": "transfer",
    "minConfidence": 0.75
  },
  "roles": {
    "x": {
      "roleAny": ["vg", "voltage"],
      "canonicalUnit": "V",
      "count": "one"
    },
    "y": {
      "roleAny": ["id", "current"],
      "canonicalUnit": "A",
      "count": "one"
    }
  }
}
```

## 按物理 layout 组织 variants

Recipe authoring 文件名按测量语言/领域命名，例如 `iv.json`、`cv.json`、
`cf.json`、`it.json`。`physicalLayout` 留在文件内部字段里，不决定路径。不要仅因为
`physicalLayout` 相同就把不同测量语言合进一个大文件。

当同一领域内多个 recipe 主要共享物理 layout 时，优先放在同一个 authoring 文件里，
再用 `variants` 表达具体语义、block 选择、曲线拆分和角色差异：

```txt
iv.json
  -> variants: builtin.iv.transfer, builtin.iv.output
  -> grouped variants: builtin.iv.transfer.x-y-group, builtin.iv.output.x-y-group

cf.json
cv.json
it.json
```

`variants` 中的每一项会在 `recipeCodec` 中展开成 Review 实际消费的具体
`Recipe`。因此 Review 和外部结果仍然看到稳定的具体 id；开发者维护源文件时先看
物理 layout，再看语义 variant。

## 修改指引

- 数据范围错了，改 `dataRange` 或上游 table-model 的 data region evidence。
- 分块错了，改 `blockPartition` 或上游 measurement block evidence。
- 列排布错了，改 `withinBlock.physicalLayout`。
- 块内曲线拆分错了，改 `seriesPartition`。
- 曲线关系错了，改 `logicalRelation`。
- x/y 角色或单位错了，改 `roles`；必要时修 table-model semantic evidence。
- ready / needsAdjustment / invalid 不符合预期，改 Review scoring，不改 recipe。

Recipe 不追求覆盖所有数据。多张无关表混在一起、pivot/crosstab、heatmap、
跨 sheet/跨文件拼接、或 PDF/OCR 还没有 canonical 化的数据，都应该让 Review
给出低置信度、`needsAdjustment` 或 `invalid`，不要在 recipe 里硬切。
