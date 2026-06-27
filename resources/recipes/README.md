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
  -> variants / domain / roles
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

### `xy` 和 `x-y-group` 的区别

`xy` 表示块内只有一组可直接绑定的 X/Y 列。Review 可以从 matched block 的
column role evidence 直接拿到 `x` 和 `y`，通常用 `blockPartition.select:
"each"`，每个 matched block 都可以独立生成候选。

`x-y-group` 表示块内除了 X/Y 外，还有 group、bias、point、label 这类列参与拆分。
Review 不能只靠 column role 直接判断曲线边界，必须结合 layout binding 找到 X/Y
和 group 关系，通常用 `blockPartition.select: "first"`，再由
`logicalRelation: "oneX-oneY-manyGroups"` 推导多条曲线。

`transfer` / `output` 不是物理排布差异。它们只是同一物理 layout 下的 IV 语义
variant：transfer 的 X 通常是 `vg`，output 的 X 通常是 `vd`。因此 recipe
文件命名应优先表达物理 layout，例如 `xy`、`x-y-group`；IV mode 和角色差异应
放在 `domain` / `roles` 或 `variants` 中表达。

### 按物理 layout 组织 variants

当多个 recipe 只有语义差异、但 `dataRange`、`blockPartition`、
`withinBlock.physicalLayout` 和 `logicalRelation` 相同时，不要拆成多份平行文件。
文件应该先表达物理 layout，文件内再用 `variants` 表达具体语义：

```txt
iv/xy.json
  -> variants: builtin.iv.transfer, builtin.iv.output

iv/x-y-group.json
  -> variants: builtin.iv.transfer.x-y-group, builtin.iv.output.x-y-group
```

`variants` 中的每一项会在 `recipeCodec` 中展开成 Review 实际消费的具体
`Recipe`。因此 Review 和外部结果仍然看到稳定的具体 id，例如
`builtin.iv.transfer`；开发者维护源文件时则先看物理 layout，再看语义 variant。

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
