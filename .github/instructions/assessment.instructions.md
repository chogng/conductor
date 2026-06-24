---
description: Assessment compatibility shell - current raw table fact production before ownership moves into Template materialization.
applyTo: 'src/cs/workbench/services/assessment/**'
---
# Assessment Compatibility Shell

Assessment is a compatibility/migration name for raw table fact production.
The formal service contract is `IRawTableFactsService` under
`services/tableFacts/common/tableFacts.ts`. Target architecture does not keep
Assessment as a primary domain: Template owns `TableFacts +
Recipe/UserTemplate -> Template` materialization. Until implementation files
move, Assessment remains the current compatibility location for structure,
column, semantic, block, and diagnostic facts.

Assessment must stay facts-only while it exists. It must not become a second
Review implementation, rank Template candidates, choose a `ReviewedTemplate`,
decide `systemRecommended`, or grow into a separate evidence service.

## Ownership

The table-fact producer (`IRawTableFactsService`) currently produces:

- measurement group/device/sample label detection;
- block/range detection within raw tables;
- IV/CV/CF/PV/IT family detection;
- IV transfer/output and IT mode detection;
- raw column semantic role mapping;
- evidence confidence and diagnostics;
- Rust/WASM/TypeScript table-fact branch selection.

It does not own file conversion, Session storage policy, Template
materialization ownership, template execution, plot/chart rendering, table UI
selection, Review decisions, system application recommendations, or search
indexing beyond diagnostics metadata.

## Core Files

| File | Responsibility |
| --- | --- |
| `../tableFacts/common/tableFacts.ts` | formal TableFacts service contract, queue contract, inputs/results, and raw-table ref helpers. |
| `common/assessment.ts` | compatibility re-export for legacy Assessment names. |
| `common/assessmentRecord.ts` | legacy raw table assessment compatibility factory and normalization helpers. |
| `common/measurement.ts` | blocks, groups, column maps, sweep/mode/family types. |
| `common/diagnostics.ts` | diagnostic severity, codes, messages, source ranges. |
| `common/rawTableStructure.ts` | header row, unit row, data region, block region, and schema fingerprint detection. |
| `common/importAssessmentSeedHeuristics.ts` | file-level import/preview seed heuristics and metadata extractor; do not add new block-aware rules here. |
| `common/columnProfile.ts` | neutral raw-table column kind and numeric-stat profiling. |
| `common/layoutCandidate.ts` | shape-only layout candidates and X/Y binding drafts for UI prefill; no measurement semantics. |
| `common/builtinSemanticLexicon.json` | maintained semantic vocabulary for header-token role evidence; not user-generated rules. |
| `common/semanticCandidate.ts` | role, unit, confidence, evidence, and display-scale candidates. |
| `common/schemaProfileAssessment.ts` | pure exact-schema-profile family/mode inference layered on top of table-fact column profiles. |
| `common/blockDetector.ts` | measurement block construction from structure ranges, column maps, and family evidence. |
| `common/assessmentEvidence.ts` | compatibility re-export for Template-owned raw table facts; do not add new APIs here. |
| `common/legacyAssessmentAdapter.ts` | migration adapter from legacy assessment records into table facts when persisted data contains old decision fields. |
| `../schemaProfile/common/schemaProfile.ts` | user-confirmed schema profile evidence records. |
| `../schemaProfile/common/schemaProfileConfirmation.ts` | pure builder for user-confirmed role/unit mappings into exact-fingerprint schema profiles. |
| `../schemaProfile/common/schemaProfileMatcher.ts` | exact schema fingerprint matching and column binding lookup. |
| `../schemaProfile/browser/schemaProfileStoreService.ts` | profile-scope persistence and versioned schema profile snapshots. |
| `../schemaProfile/browser/schemaProfileService.ts` | schema profile owner API consumed by the table-fact producer. |
| `browser/assessmentService.ts` | compatibility browser orchestration and branch selection. |
| `browser/rawTableAssessmentEngine.ts` | raw table-fact workflow that composes import seed evidence with structure, profile, semantic, and block evidence. |
| `browser/importAssessmentSeed.ts` | browser adapter from import file/row previews to import seed evidence. |
| `browser/assessment.contribution.ts` | compatibility session subscriber that schedules/commits table facts. |
| `test/fixtures/**` | fixture corpus for current table-fact invariants: structure, layout, column semantics, profile exact-match safety, and Template materialization inputs. |

## Flow

```txt
workbench restored / current session audit
  -> TableFacts queue
     (legacy implementation may still be AssessmentQueueService.enqueueRawTables)
rawTablesChanged
  -> SessionSnapshot / RawTableRecord
  -> TableFacts queue captures raw table version and schema profile snapshot/version
  -> TableFacts queue drops queued/running work when any captured input
     changes before or after row reads
  -> table-fact producer
     (IRawTableFactsService.createRawTableFacts; legacy assessRawTable alias may remain)
  -> captured SchemaProfile snapshot
  -> RawTableAssessmentEngine.assess
  -> detectRawTableStructure / createColumnProfiles
  -> detectLayoutCandidates
  -> optional exact SchemaProfile fingerprint match
  -> createColumnSemanticCandidates
  -> detectMeasurementBlocks
  -> RawTableFactsRecord
     (legacy RawTableAssessmentRecord compatibility name may remain)
  -> ISessionService.commitRawTableFacts
```

## Rules

- `RawTableRecord` never owns blocks.
- A raw table may contain multiple measurement blocks.
- Blocks and diagnostics point back to source cells through `RawTableRangeRef`.
- Table-fact output includes `sourceRawTableVersion`; stale results must be ignored.
- Table-fact output includes `schemaProfileVersion`; profile changes invalidate
  stored table facts and the table-fact queue must reassess matching raw tables.
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
- Schema profile bindings may confirm role/unit candidates. Exact,
  conflict-free profile matches may also produce family/mode facts only when
  confirmed `axis: x` / `axis: y` bindings form an unambiguous supported
  family such as `vg`/`id` IV transfer, `vd`/`id` IV output, CV, CF, or IT;
  generic `voltage`/`current` mappings remain ambiguous inputs for Template
  materialization and Review.
- Schema profile persistence belongs to `SchemaProfileService` /
  `SchemaProfileStoreService`; do not store profiles in Session or template
  records.
- User-confirmed role/unit mappings should be written through
  `SchemaProfileService.confirmProfile(...)`, which builds exact-fingerprint
  schema profile bindings from table-fact column profiles and persists them
  through the schema profile owner.
- Block detection groups source ranges and column maps into
  `MeasurementBlockRecord`; repeated block regions must produce separate blocks
  with per-block source ranges. Template materializers must consume those facts
  instead of re-detecting them.
- Assessment must not emit ready/inferred/review/unknown decisions or automatic
  apply gates. `ReviewDecision.application` owns system-application decisions
  from Review confidence and diagnostics.
- Current migration evidence shape is table facts, not `RecipeEvidence`.
  Recipe is fixed rules; Template combines table facts with Recipe/UserTemplate
  snapshots.
- Assessment must not resolve Recipe snapshots, UserTemplate catalogs, or
  selected Template snapshots. Template owns materialization; Review owns
  candidate review and selected `ReviewedTemplate` persistence.
- A confident layout with weak or unknown semantics is still only a table fact.
  Review, not Assessment, decides whether the resulting Template needs manual
  adjustment or can be applied.
- TypeScript table-fact rules are semantic baseline. When changing mirrored
  table-fact rules, update Rust mirrors under `cli/src/assessment.rs` /
  `cli/src/detect.rs`.
- Mirrored table-fact rule changes require targeted tests and compatibility
  fixtures when classification/confidence/record shape changes.
- Add or update fixture corpus cases when changing structure, layout, semantic,
  profile matching, block construction, or Template materialization inputs. Fixture
  expectations should cover data regions, numeric columns, block count/family,
  column roles/units, and Review handoff behavior, not only display curve type.

## Commands

Table-fact production currently runs from session events through the TableFacts
compatibility shell. Direct commands are only for explicit reprocessing or
developer tools and must delegate to the table-fact producer
(`IRawTableFactsService`) then Session `commitRawTableFacts`.
Commands must not
detect blocks themselves. Commands that record user-confirmed column roles or
units must read the current `RawTableFactsRecord` fingerprint/column profiles
and persist through `SchemaProfileService.confirmProfile(...)`; the
profile-change event owns table-fact reprocessing.

## Field Catalog

Use `records.instructions.md` for table-fact record fields.

## Do Not

- Do not mutate raw table data.
- Do not apply templates.
- Do not build final curves.
- Do not let Review/Slice/Plot re-detect headers, roles, blocks, or sweep mode.
- Do not add a new standalone evidence service; move target
  materialization ownership into Template.
