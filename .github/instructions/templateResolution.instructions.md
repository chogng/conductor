---
description: Template Resolution service - migration bridge for deriving Assessment evidence plus Recipe/UserTemplate catalogs into Template candidate records.
applyTo: 'src/cs/workbench/services/templateResolution/**'
---
# Template Resolution

Template Resolution is a migration bridge for automatic candidate derivation.
It consumes stored Assessment evidence, current Recipe snapshots, and the
UserTemplate catalog. It must not read raw rows and it must not be the
final template usability or system-application decision owner.

## Ownership

`ITemplateResolutionService` owns during migration:

- rebuilding `RawTableEvidence` from `RawTableAssessmentRecord`;
- evaluating `RecipeSelector` predicates against Assessment evidence;
- materializing `RecipeProjection` into concrete `Template` snapshots;
- evaluating UserTemplate catalog compatibility against stored evidence;
- ranking candidate summaries for downstream Review;
- committing `RawTableTemplateResolutionRecord` values through Session.

It does not own:

- raw row profiling or semantic detection;
- Assessment decisions, blocks, column roles, units, or diagnostics;
- Review decisions, reviewed-template selection, candidate conflict policy, or
  `systemRecommended` / `userActionRequired`;
- Slice planning, row reading, execution, progress, or queue state;
- Template catalog CRUD or Template editor/view state.

## Core Files

| File | Responsibility |
| --- | --- |
| `common/templateResolution.ts` | service contract, record, candidate, diagnostic, signature, and commit types. |
| `common/templateCandidate.ts` | candidate/source normalization helpers when needed. |
| `common/recipeSelectorEvaluator.ts` | pure finite-DSL evaluator for `RecipeSelector` against `RawTableEvidence`. |
| `common/recipeTemplateMaterializer.ts` | pure Recipe projection materialization into concrete `Template` snapshots. |
| `common/userTemplateEvaluator.ts` | pure UserTemplate compatibility evaluation against Assessment evidence. |
| `browser/templateResolutionService.ts` | injectable owner for resolve/enqueue/commit state. |
| `browser/templateResolution.contribution.ts` | lifecycle subscriber for Assessment, Recipe, and UserTemplate catalog changes. |

## Flow

```txt
Session assessmentChanged / fileMetadataChanged
  -> TemplateResolutionContribution
  -> ITemplateResolutionService.enqueueForAssessments(rawTableRefs)
  -> TemplateResolutionService reads SessionSnapshot
  -> resolve RawTableEvidence + RecipeSnapshot + UserTemplateSnapshot
  -> ISessionService.commitTemplateResolutions(...)
  -> Session templateResolutionChanged
  -> ReviewContribution / ReviewService deriveAndReview
  -> Session reviewChanged
```

Recipe changes:

```txt
RecipeService.onDidChangeRecipes
  -> TemplateResolutionContribution
  -> ITemplateResolutionService.enqueueAllCurrentAssessments()
  -> commit TemplateResolution records only
```

UserTemplate catalog changes:

```txt
IUserTemplateService.onDidChangeUserTemplates
  -> TemplateResolutionContribution
  -> ITemplateResolutionService.enqueueAllCurrentAssessments()
  -> rerun UserTemplate compatibility only from stored Assessment evidence
```

## Rules

- Template Resolution may read `SessionSnapshot`, `RecipeSnapshot`, and
  `UserTemplateSnapshot`; it must not read raw rows or call row readers.
- During the bridge, Template Resolution stores candidate summaries only.
  Selected executable Template snapshots belong to Review records.
- Resolution records use a separate `templateResolutionChanged` event and are
  invalidation inputs for Review, not execution triggers.
- Resolution invalidates on Assessment evidence signature, Recipe fingerprint,
  or UserTemplate catalog version changes.
- Recipe selector/projection behavior belongs here while the bridge exists,
  then moves behind Review candidate providers. It does not belong in Slice.
- UserTemplate compatibility belongs here during migration, not in Template
  view code and not in Slice.
- Diagnostics are resolution diagnostics: selector mismatches, projection
  failures, UserTemplate incompatibility, or candidate conflicts. Raw table
  semantic diagnostics remain Assessment-owned.
- Automatic Slice must consume Review decisions, not Template Resolution
  candidate ordering.

## Do Not

- Do not call this layer Assessment, Rule, Template Apply, or Slice planning.
- Do not import `IRawTableRowsReaderService`.
- Do not call `ISliceService` from Template Resolution.
- Do not let Template Resolution decide `systemRecommended`, manual adjustment,
  or invalid states.
- Do not let RecipeService evaluate recipes or materialize Templates.
- Do not let Slice import RecipeService, recipe selector evaluators, or recipe
  materializers.
