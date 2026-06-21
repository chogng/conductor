---
description: Assessment service - raw table interpretation, measurement block detection, column role mapping, sweep mode inference, confidence, and diagnostics.
applyTo: 'src/cs/workbench/services/assessment/**'
---
# Assessment

Assessment converts raw table facts into measurement structure. It is the only
owner of group/block/column role/sweep mode detection.

## Ownership

`IAssessmentService` owns:

- measurement group/device/sample label detection;
- block/range detection within raw tables;
- IV/CV/CF/PV/IT family detection;
- IV transfer/output and IT mode detection;
- raw column semantic role mapping;
- confidence and diagnostics;
- Rust/WASM/TypeScript assessment branch selection.

It does not own file conversion, Session storage, template execution, plot/chart
rendering, table UI selection, or search indexing beyond diagnostics metadata.

## Core Files

| File | Responsibility |
| --- | --- |
| `common/assessment.ts` | service contract, inputs/results. |
| `common/measurement.ts` | blocks, groups, column maps, sweep/mode/family types. |
| `common/diagnostics.ts` | diagnostic severity, codes, messages, source ranges. |
| `browser/assessmentService.ts` | browser orchestration and branch selection. |
| `browser/fileAssessment.ts` | browser adapter from import previews to shared rules. |
| `browser/assessmentRules.ts` | TypeScript fallback heuristics. |
| `browser/assessment.contribution.ts` | session subscriber that schedules/commits assessments. |

## Flow

```txt
workbench restored / current session audit
  -> AssessmentQueueService.enqueueRawTables
rawTablesChanged
  -> SessionSnapshot / RawTableRecord
  -> IAssessmentService.assessRawTable
  -> RawTableAssessmentRecord
  -> ISessionService.commitRawTableAssessment
```

## Rules

- `RawTableRecord` never owns blocks.
- A raw table may contain multiple measurement blocks.
- Blocks and diagnostics point back to source cells through `RawTableRangeRef`.
- Assessment output includes `sourceRawTableVersion`; stale results must be ignored.
- Queue entries capture raw table source version and drop results if the version changes before commit.
- Raw tables with decode/parse/unsupported health are not assessable.
- Keep measurement family and mode separate: `iv` is a family; `transfer` and `output` are IV modes.
- `curveTypeLabel` / UI `curveType` strings are display projections only.
- TypeScript rules are semantic baseline. When changing mirrored assessment or auto-template rules, update Rust mirrors under `cli/src/assessment.rs` / `cli/src/detect.rs`.
- Mirrored rule changes require `npm run verify:rust-auto-extraction` plus targeted tests and compatibility fixtures when classification/confidence/plan shape changes.

## Commands

Assessment normally runs from session events. Direct commands are only for
explicit reassessment or developer tools and must delegate to
`IAssessmentService` then Session commit. Commands must not detect blocks
themselves.

## Field Catalog

Use `records.instructions.md` for assessment record fields.

## Do Not

- Do not mutate raw table data.
- Do not apply templates.
- Do not build final curves.
- Do not let Template/Table/Plot re-detect headers, roles, blocks, or sweep mode.
