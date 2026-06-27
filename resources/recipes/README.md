# Recipes

Recipe 是内置的、可读的 review 候选切分说明。它不直接生成最终
Template，也不决定 ready / needsAdjustment / invalid。Review 负责把
Recipe 套到当前 `ReviewEvidence` 上，生成 `ReviewCandidate`，再评分。

修改 recipe 时按这个顺序定位问题：

```txt
dataRange
  -> blockPartition
  -> withinBlock.physicalLayout
  -> logicalRelation
  -> domain / roles
  -> Review scoring
```

## 字段

`dataRange` 回答“数据范围在哪里”。当前只使用：

```json
{ "kind": "detectedDataRegion" }
```

`blockPartition` 回答“能不能按块分、取哪些块”：

```json
{
  "kind": "measurementBlocks",
  "select": "each",
  "minConfidence": 0.75
}
```

`select: "each"` 表示每个匹配 block 都生成候选；`select: "first"` 表示只取
第一个匹配 block，适合 `x-y-group` 这类一个表内已经带 group 列的形态。

`withinBlock.physicalLayout` 只描述块内物理排布，不描述测量语义：

| Layout | 含义 |
| --- | --- |
| `xy` | 一列 X，一列 Y。 |
| `xyyyy` | 一列 X，多列 Y。单 Y 也可以由 Review 低风险接受。 |
| `xyxyxy` | 多组相邻 X/Y pair。 |
| `x-y-group` | X、Y 和 group/bias/label 列在同一块内。 |
| `blocks.xy` | 多个 block，每个 block 内是 `xy`。 |
| `blocks.xyyyy` | 多个 block，每个 block 内是 `xyyyy`。 |

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

## 修改指引

- 数据范围错了，改 `dataRange` 或上游 table-model 的 data region evidence。
- 分块错了，改 `blockPartition` 或上游 measurement block evidence。
- 列排布错了，改 `withinBlock.physicalLayout`。
- 曲线/group 关系错了，改 `logicalRelation`。
- x/y 角色或单位错了，改 `roles`，必要时修 table-model semantic evidence。
- ready / needsAdjustment / invalid 不符合预期，改 Review scoring，不改 recipe。

Recipe 不追求覆盖所有数据。多张无关表混在一起、pivot/crosstab、heatmap、
跨 sheet/跨文件拼接、或 PDF/OCR 还没有 canonical 化的数据，都应该让 Review
给出低置信度、`needsAdjustment` 或 `invalid`，不要在 recipe 里硬切。
