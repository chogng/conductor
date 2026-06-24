---
description: Assessment service - raw table evidence, measurement block detection, column role mapping, sweep mode inference, and diagnostics.
applyTo: 'src/cs/workbench/services/assessment/**'
---
# Assessment

Assessment currently converts raw table facts into measurement evidence. It is
the only owner of group/block/column role/sweep mode detection and is the
migration location for the future RawTableEvidence service.

## Ownership

`IAssessmentService` owns:

- measurement group/device/sample label detection;
- block/range detection within raw tables;
- IV/CV/CF/PV/IT family detection;
- IV transfer/output and IT mode detection;
- raw column semantic role mapping;
- evidence confidence and diagnostics;
- Rust/WASM/TypeScript assessment branch selection.

It does not own file conversion, Session storage, template execution, plot/chart
rendering, table UI selection, Review decisions, system application
recommendations, or search indexing beyond diagnostics metadata.

## Core Files

| File | Responsibility |
| --- | --- |
| `common/assessment.ts` | service contract, inputs/results. |
| `common/assessmentRecord.ts` | raw table assessment record factory and normalization helpers. |
| `common/assessmentDecision.ts` | legacy evidence-level decision summary used during migration; new system-application decisions belong to Review. |
| `common/measurement.ts` | blocks, groups, column maps, sweep/mode/family types. |
| `common/diagnostics.ts` | diagnostic severity, codes, messages, source ranges. |
| `common/rawTableStructure.ts` | header row, unit row, data region, block region, and schema fingerprint detection. |
| `common/importAssessmentSeedHeuristics.ts` | file-level import/preview seed heuristics and metadata extractor; do not add new block-aware rules here. |
| `common/columnProfile.ts` | neutral raw-table column kind and numeric-stat profiling. |
| `common/layoutCandidate.ts` | shape-only layout candidates and X/Y binding drafts for UI prefill; no measurement semantics. |
| `common/builtinSemanticLexicon.json` | maintained semantic vocabulary for header-token role evidence; not user-generated rules. |
| `common/semanticCandidate.ts` | role, unit, confidence, evidence, and display-scale candidates. |
| `common/schemaProfileAssessment.ts` | pure exact-schema-profile family/mode inference layered on top of Assessment column profiles. |
| `common/blockDetector.ts` | measurement block construction from structure ranges, column maps, and family evidence. |
| `common/assessmentEvidence.ts` | standard evidence snapshot consumed by Review candidate derivation; Assessment produces evidence but does not select templates. |
| `common/legacyAssessmentAdapter.ts` | migration adapter from legacy assessment records into RawTableEvidence/Review shapes when persisted data contains old decision fields. |
| `../schemaProfile/common/schemaProfile.ts` | user-confirmed schema profile evidence records. |
| `../schemaProfile/common/schemaProfileConfirmation.ts` | pure builder for user-confirmed role/unit mappings into exact-fingerprint schema profiles. |
| `../schemaProfile/common/schemaProfileMatcher.ts` | exact schema fingerprint matching and column binding lookup. |
| `../schemaProfile/browser/schemaProfileStoreService.ts` | profile-scope persistence and versioned schema profile snapshots. |
| `../schemaProfile/browser/schemaProfileService.ts` | schema profile owner API consumed by Assessment. |
| `browser/assessmentService.ts` | browser orchestration and branch selection. |
| `browser/rawTableAssessmentEngine.ts` | raw table assessment workflow that composes import seed evidence with structure, profile, semantic, block, and decision evidence. |
| `browser/assessmentDecisionPolicy.ts` | decision gate from assessment evidence to ready/inferred/review/unknown states. |
| `browser/importAssessmentSeed.ts` | browser adapter from import file/row previews to import seed evidence. |
| `browser/assessment.contribution.ts` | session subscriber that schedules/commits assessments. |
| `test/fixtures/**` | fixture corpus for Assessment V2 invariants: structure, layout, column semantics, profile exact-match safety, and auto-apply gates. |

## Flow

```txt
workbench restored / current session audit
  -> AssessmentQueueService.enqueueRawTables
rawTablesChanged
  -> SessionSnapshot / RawTableRecord
  -> AssessmentQueueService captures raw table version and schema profile snapshot/version
  -> AssessmentQueueService drops queued/running work when any captured input
     changes before or after row reads
  -> IAssessmentService.assessRawTable
  -> captured SchemaProfile snapshot
  -> RawTableAssessmentEngine.assess
  -> detectRawTableStructure / createColumnProfiles
  -> detectLayoutCandidates
  -> optional exact SchemaProfile fingerprint match
  -> createColumnSemanticCandidates
  -> detectMeasurementBlocks
  -> create legacy AssessmentDecision evidence summary
  -> RawTableAssessmentRecord
  -> ISessionService.commitRawTableAssessment
```

## Rules

- `RawTableRecord` never owns blocks.
- A raw table may contain multiple measurement blocks.
- Blocks and diagnostics point back to source cells through `RawTableRangeRef`.
- Assessment output includes `sourceRawTableVersion`; stale results must be ignored.
- Assessment output includes `schemaProfileVersion`; profile changes invalidate
  stored assessments and the assessment queue must reassess matching raw tables.
- Queue entries capture raw table source version and drop results if the version changes before commit.
- Raw tables with decode/parse/unsupported health are not assessable.
- Keep measurement family and mode separate: `iv` is a family; `transfer` and `output` are IV modes.
- `curveTypeLabel` / UI `curveType` strings are display projections only.
- `RawTableStructure` is physical table evidence only. It must not infer measurement family or template behavior.
- Repeated header sections with an exact matching schema fingerprint may become
  multiple `repeatedHeader` block regions; keep this conservative and do not use
  fuzzy header similarity to split auto-applied blocks.
- `ColumnProfile` is neutral numeric/text evidence. Semantic role and unit evidence belongs in `ColumnSemanticCandidate`.
- Built-in semantic vocabulary belongs in `builtinSemanticLexicon.json`. Keep it narrow,
  maintained, and evidence-oriented; do not generate per-file rule JSON from
  imported data.
- `LayoutCandidate` is neutral table-shape evidence. It may identify simple XY,
  shared-X multi-Y, pairwise XY, grouped sweep, wide matrix, time series,
  repeated-block, or metadata preamble bindings for UI prefill, but it must not
  infer measurement family, role, unit, or unlock automatic calculation.
- Schema profile evidence is optional and may influence semantic candidates only
  after an exact `RawTableStructure.fingerprint` match; do not use fuzzy schema
  matching to auto-calculate.
- Schema profile bindings may confirm role/unit candidates. Exact, conflict-free
  profile matches may also unlock a measurement family only when confirmed
  `axis: x` / `axis: y` bindings form an unambiguous supported family such as
  `vg`/`id` IV transfer, `vd`/`id` IV output, CV, CF, or IT; generic
  `voltage`/`current` mappings still require review.
- Schema profile persistence belongs to `SchemaProfileService` /
  `SchemaProfileStoreService`; do not store profiles in Session or template
  records.
- User-confirmed role/unit mappings should be written through
  `SchemaProfileService.confirmProfile(...)`, which builds exact-fingerprint
  schema profile bindings from Assessment column profiles and persists them
  through the schema profile owner.
- Block detection groups assessed source ranges and column maps into
  `MeasurementBlockRecord`; repeated block regions must produce separate blocks
  with per-block source ranges. Template code must consume those blocks instead
  of re-detecting them.
- `AssessmentDecision.autoApplyAllowed` is a legacy evidence summary during the
  Review migration. New code must not treat it as the system-application gate;
  `ReviewDecision.application` owns that decision.
- Assessment must not resolve Recipe snapshots, saved Template catalogs, or
  selected Template snapshots. Review owns candidate review and selected
  `ReviewedTemplate` persistence for automatic execution.
- A confident layout with weak or unknown semantics should use
  `reviewRequired`, not `ready`; layout ready is not calculation ready.
- TypeScript assessment rules are semantic baseline. When changing mirrored
  assessment rules, update Rust mirrors under `cli/src/assessment.rs` /
  `cli/src/detect.rs`.
- Mirrored assessment rule changes require targeted tests and compatibility
  fixtures when classification/confidence/record shape changes.
- Add or update fixture corpus cases when changing structure, layout, semantic,
  profile matching, block construction, or decision-gate behavior. Fixture
  expectations should cover data regions, numeric columns, block count/family,
  column roles/units, and Review handoff behavior, not only display curve type.

## Commands

Assessment normally runs from session events. Direct commands are only for
explicit reassessment or developer tools and must delegate to
`IAssessmentService` then Session commit. Commands must not detect blocks
themselves. Commands that record user-confirmed column roles or units must read
the current `RawTableAssessmentRecord` fingerprint/column profiles and persist
through `SchemaProfileService.confirmProfile(...)`; the profile-change event
owns reassessment.

## Field Catalog

Use `records.instructions.md` for assessment record fields.

## Do Not

- Do not mutate raw table data.
- Do not apply templates.
- Do not build final curves.
- Do not let Template/Table/Plot re-detect headers, roles, blocks, or sweep mode.
