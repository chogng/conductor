---
description: TableModel domain - raw-table structure, profiles, semantics, blocks, diagnostics, queue contracts, and compatibility boundaries.
applyTo: 'src/cs/workbench/services/tableModel/**,src/cs/workbench/contrib/tableModel/**'
---
# TableModel

For the table URI/editor-model migration under `services/table/**`, follow
`.github/instructions/迁移说明.md` first. This file describes the legacy
`services/tableModel/**` derived structure/semantics producer; its
`browser/tableModelService.ts` is not the URI-backed table model resolver.

TableModel is the derived model layer for raw tables consumed by Template materialization.
It is not Review, not Recipe, and not Slice. TableModel 负责“把表格源数据变成 Template 能理解的结构语义”

```txt
ISessionService RawTableRecord + SchemaProfile snapshot
  -> ITableModelProducerService
  -> ITableModelProducerService.getOrCreate(...)
  -> TableModel.create(...)
  -> TableModelRecord
  -> ISessionService.commitTableModel(...)
  + Recipe/UserTemplate snapshots
  -> Template materialization
  -> Review
  -> Slice
```

## Ownership

`services/tableModel/common` owns formal TableModel contracts and pure helpers:
structure detection, column profiles, semantic candidates, layout candidates,
measurement blocks, diagnostics, import-preview seed heuristics, and record
factories.

`services/tableModel/browser` owns the injectable TableModel producer, queue,
and lifecycle contribution. New code must import formal contracts, helpers, and
browser implementations from `services/tableModel`.

`contrib/tableModel` owns user-visible command/action registration for explicit
TableModel operations. It delegates all model reads/writes to the owning
services.

TableModel must not produce `TemplateDraft`, `ReviewedTemplate`,
`ReviewDecision`, `systemRecommended`, or `SliceRequest`.

## Core Files

| File | Responsibility |
| --- | --- |
| `common/tableModel.ts` | `TableModelRecord` / `TableModel` contracts, `TableModel.create(...)`, rule version, `ITableModelProducerService`, queue contract, service inputs, and raw-table ref helpers. |
| `common/tableModelRecord.ts` | compatibility re-export for model creation/normalization helpers. |
| `common/rawTableStructure.ts` | physical table structure and schema fingerprint detection. |
| `common/columnProfile.ts` | neutral raw-column profiles and measurement column projections. |
| `common/semanticCandidate.ts` | role/unit/display-scale candidates. |
| `common/layoutCandidate.ts` | shape-only binding drafts for materialization/review prefill. |
| `common/blockDetector.ts` | measurement block construction from table model. |
| `common/measurement.ts` | measurement family/mode/block/column record types. |
| `common/diagnostics.ts` | table-model diagnostics and source ranges. |
| `common/importTableModelSeedHeuristics.ts` | table-model seed heuristics used inside TableModel production. |
| `browser/importTableModelSeed.ts` | browser adapter from file/rows to `ImportTableModelSeed` for TableModel production. |
| `browser/tableModelEngine.ts` | browser TableModel production workflow. |
| `browser/tableModelService.ts` | injectable `ITableModelProducerService` implementation. |
| `browser/tableModelQueueService.ts` | injectable queue for scheduling table-model production and committing derived records through the Session ledger. |
| `browser/tableModel.contribution.ts` | Session raw-table lifecycle subscriber that enqueues raw tables. |
| `contrib/tableModel/browser/tableModelCommands.ts` | TableModel command/action registration and handlers; delegates to owner services. |
| `contrib/tableModel/browser/tableModel.contribution.ts` | workbench contribution wiring for TableModel commands. |

## Rules

- TableModel may infer structure, profiles, semantic candidates, groups,
  blocks, and diagnostics only.
- `blocks`, `columnProfiles`, `layoutCandidates`, `semanticCandidates`, and
  `structure` are fields on `TableModelRecord`; do not present them as a
  separate facts/evidence service.
- TableModel reads raw tables from `ISessionService` snapshots and commits
  `TableModelRecord` values through `ISessionService` while Session remains
  the migration ledger.
- Recipe is fixed selector/projection data; Template materializers interpret it
  against TableModel.
- Review owns candidate ranking, selected reviewed template, and application
  recommendation.
- Slice executes reviewed/manual Template snapshots and must not re-detect
  table model.
- Retired table-model service, record, and command names must not be reintroduced
  as compatibility aliases.
