---
description: Template Resolution service - legacy compatibility bridge for old Template Resolution candidate summary records.
applyTo: 'src/cs/workbench/services/templateResolution/**'
---
# Template Resolution

Template Resolution is a legacy compatibility bridge for old
automatic-candidate summary records. It is not part of the primary
TableFacts + Recipe/UserTemplate -> Template -> Review -> Slice path.

When compatibility records are still required, it consumes stored table facts,
current Recipe snapshots, and the UserTemplate catalog, then projects
materialized `TemplateDraft` values into legacy
`RawTableTemplateResolutionRecord` summaries. It must not read raw rows, own
Recipe/UserTemplate materializers, feed Review as a prerequisite, or
decide final template usability and system application.

## Ownership

`ITemplateResolutionService` owns during migration:

- rebuilding table facts from migration `RawTableAssessmentRecord` values;
- consuming Template-owned automatic `TemplateDraft` materializers;
- projecting drafts into legacy Template Resolution candidate summaries;
- committing `RawTableTemplateResolutionRecord` values through Session.

It does not own:

- raw row profiling or semantic detection;
- table-fact detection, blocks, column roles, units, or diagnostics;
- Review decisions, reviewed-template selection, candidate conflict policy, or
  `systemRecommended` / `userActionRequired`;
- Slice planning, row reading, execution, progress, or queue state;
- Template catalog CRUD or Template editor/view state.

## Core Files

| File | Responsibility |
| --- | --- |
| `common/templateResolution.ts` | service contract, record, candidate, diagnostic, signature, and commit types. |
| `common/templateCandidate.ts` | candidate/source normalization helpers when needed. |
| `browser/templateResolutionService.ts` | injectable bridge for resolve/enqueue/commit state; consumes pure Template materializers and writes legacy summaries. |
| `browser/templateResolution.contribution.ts` | legacy helper for explicit compatibility runs; it is not registered by the workbench entry point. |

## Flow

Primary Review flow bypasses Template Resolution:

```txt
TableFacts + Recipe/UserTemplate
  -> Template materialization
  -> Template candidates / Template
  -> IReviewService.deriveAndReview(...)
  -> ISessionService.commitRawTableReviews(...)
```

Legacy compatibility flow only:

```txt
Session assessmentChanged / fileMetadataChanged
  -> explicitly constructed TemplateResolutionContribution
  -> ITemplateResolutionService.enqueueForAssessments(rawTableRefs)
  -> TemplateResolutionService reads SessionSnapshot
  -> resolve table facts + RecipeSnapshot + UserTemplateSnapshot
  -> ISessionService.commitTemplateResolutions(...)
  -> Session templateResolutionChanged
  -> legacy consumers may refresh old candidate-summary views
```

Recipe changes:

```txt
RecipeService.onDidChangeRecipes
  -> explicitly constructed TemplateResolutionContribution
  -> ITemplateResolutionService.enqueueAllCurrentAssessments()
  -> commit TemplateResolution records only
```

UserTemplate catalog changes:

```txt
IUserTemplateService.onDidChangeUserTemplates
  -> explicitly constructed TemplateResolutionContribution
  -> ITemplateResolutionService.enqueueAllCurrentAssessments()
  -> rerun UserTemplate compatibility only from stored table facts
```

## Rules

- Template Resolution may read `SessionSnapshot`, `RecipeSnapshot`, and
  `UserTemplateSnapshot`; it must not read raw rows or call row readers.
- During the bridge, Template Resolution stores candidate summaries only.
  Selected executable Template snapshots belong to Review records.
- Resolution records use a separate `templateResolutionChanged` event and are
  legacy compatibility invalidation signals, not Review prerequisites or
  execution triggers.
- Resolution invalidates on table-fact signature, Recipe fingerprint,
  or UserTemplate catalog version changes.
- Recipe selector/projection behavior belongs to Template materializers.
  Template Resolution may import pure materializers only to write compatibility
  summaries. It does not belong in Slice.
- UserTemplate compatibility belongs to Template materializers during the
  bridge, not in Template Resolution, Template view code, or Slice.
- Diagnostics are resolution diagnostics: selector mismatches, projection
  failures, UserTemplate incompatibility, or candidate conflicts. Raw table
  semantic diagnostics remain table-fact inputs.
- Automatic Slice must consume Review decisions, not Template Resolution
  candidate ordering.

## Do Not

- Do not call this layer Assessment, Rule, Template Apply, or Slice planning.
- Do not import `IRawTableRowsReaderService`.
- Do not call `ISliceService` from Template Resolution.
- Do not let Template Resolution decide `systemRecommended`, manual adjustment,
  or invalid states.
- Do not add new selector/materializer implementations under
  `services/templateResolution/common`; keep candidate derivation in
  `services/template/common` as the target owner.
- Do not let RecipeService evaluate recipes or materialize Templates.
- Do not let Slice import RecipeService, recipe selector evaluators, or recipe
  materializers.
