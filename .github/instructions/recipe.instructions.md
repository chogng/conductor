---
description: Recipe service - passive physical-layout and logical-relation recipes consumed by Review candidate builders to derive review candidates.
applyTo: 'src/cs/workbench/services/recipe/**,resources/recipes/**,scripts/buildRecipeBundle.mjs,cli/resources/recipes.v1.json'
---
# Recipe

`Recipe` is a passive built-in description for deriving a `ReviewCandidate`
from content evidence. It is not a `Template`, not an executable extraction
plan, not a provider, and not a retired rule engine.

Recipe authoring follows the developer debugging order:

```txt
dataRange
  -> blockPartition
  -> withinBlock.physicalLayout
  -> logicalRelation
  -> variants / domain / roles
```

Review owns interpretation and scoring:

```txt
Recipe[]
  + Canonical content evidence
  -> ReviewContext evidence
  -> ReviewCandidate
  -> ReviewResult / ReviewedTemplate
  -> Slice
```

## Ownership

`IRecipeService` owns the recipe catalog snapshot, catalog fingerprint,
diagnostics, reload, and `onDidChangeRecipes` event. It does not evaluate raw
tables, score matches, build review candidates, execute slicing, or mutate
Session.

Review candidate builders own recipe interpretation:

- checking `dataRange` against `ReviewContext.evidence`;
- checking `blockPartition` against measurement block evidence;
- checking `withinBlock.physicalLayout` against physical layout evidence;
- mapping `logicalRelation` and role captures into a candidate interpretation;
- candidate ordering before Review scoring.

Recipe consumes only ReviewContext evidence through Review-owned candidate
builders. Recipe must not import table-model APIs or infer measurement family,
roles, units, or table structure from raw rows.

## Core Files

| File | Responsibility |
| --- | --- |
| `common/recipe.ts` | `Recipe`, `RecipeSnapshot`, diagnostics, and `IRecipeService` contract. |
| `common/recipeSchema.ts` | finite authoring vocabulary for data ranges, block partitions, physical layouts, logical relations, domain hints, and role expectations. |
| `common/recipeSelector.ts` | compatibility exports for role/domain vocabulary. Do not add behavior here. |
| `common/recipeProjection.ts` | compatibility exports for range/layout/relation vocabulary. Do not add Template materialization here. |
| `common/recipeCodec.ts` | JSON normalization, validation diagnostics, stable fingerprinting. |
| `common/builtinRecipes.generated.ts` | generated built-in recipe bundle. Do not edit manually. |
| `browser/recipeService.ts` | thin injectable owner for the built-in recipe snapshot and change event. |
| `resources/recipes/README.md` | authoring guide for hand-written recipe JSON. |
| `resources/recipes/v1/index.json` | ordered source bundle index. |
| `resources/recipes/v1/**/*.json` | hand-authored passive recipe JSON. |
| `scripts/buildRecipeBundle.mjs` | builds generated TypeScript and CLI recipe bundles. |
| `cli/resources/recipes.v1.json` | generated CLI bundle. Do not edit manually. |

Automatic recipe candidate derivation belongs in Review. Template Resolution is
retired and must not be reintroduced as a compatibility bridge or second
candidate implementation:

| File | Responsibility |
| --- | --- |
| `review/common/reviewSelector.ts` | target home for checking Recipe authoring fields against `ReviewContext.evidence` and producing selector traces/captures. |
| `review/common/reviewCandidate.ts` | target home for deriving `ReviewCandidate` values from Recipe/UserTemplate snapshots and `ReviewContext`. |
| `review/common/reviewModel.ts` | target home for context, candidate, result, factors, findings, and decision data shapes. |
| `review/common/reviewEvidence.ts` | target home for URI/content evidence types used by ReviewContext; current table fields are one projection of that evidence. |
| `review/common/reviewScoring.ts` | target home for scoring candidates into explainable factors/findings/status. |
| `review/browser/reviewService.ts` | owner that combines Recipe, UserTemplate, and URI/content evidence into automatic review results; the current table model only supplies one projection. |

## Flow

```txt
resources/recipes/v1/index.json
  -> scripts/buildRecipeBundle.mjs
  -> builtinRecipes.generated.ts + cli/resources/recipes.v1.json
  -> recipeCodec expands authoring variants into concrete Recipe[]
  -> RecipeService.getSnapshot()
  -> ReviewService observes recipe/content-evidence/UserTemplate changes
  -> ReviewService builds ReviewCandidate values from recipe authoring fields
  -> ReviewService scores candidates into ReviewResult
  -> ReviewResult stores selected ReviewedTemplate snapshot when ready
  -> explicit execution controller / Slice command submits SliceRequest only when systemRecommended
```

Recipe changes are owner-event-reread:

```txt
RecipeService reload/change
  -> onDidChangeRecipes
  -> IReviewService rebuilds affected ReviewCandidate values
  -> IReviewService reviews affected candidates
  -> IReviewService.onDidChangeReview
```

## Rules

- A concrete `Recipe` must stay passive JSON with `id`, `version`,
  `priority`, `label`, `dataRange`, `blockPartition`, `withinBlock`,
  `logicalRelation`, optional `domain`, and `roles`.
- Hand-authored source files may group semantic variants under one physical
  layout with `variants`. The shared file fields describe `dataRange`,
  `blockPartition`, `withinBlock.physicalLayout`, and `logicalRelation`; each
  variant supplies the concrete recipe `id`, `priority`, `label`, `domain`, and
  `roles`. `RecipeService` publishes only the expanded concrete `Recipe[]`.
- `dataRange` describes where usable data begins; it does not read files.
- `blockPartition` describes whether Review should use each measurement block
  or the first matching block; it does not create blocks itself.
- `withinBlock.physicalLayout` describes physical arrangement only, such as
  `xy`, `xyyyy`, `xyxyxy`, `x-y-group`, `blocks.xy`, or `blocks.xyyyy`.
- `logicalRelation` describes the curve relation, such as `oneX-oneY`,
  `oneX-manyY`, `oneX-oneY-manyGroups`, `manyXYpairs`, or
  `manyBlocks-oneX-oneY`.
- `domain` and `roles` are semantic expectations over already-produced
  evidence. They are not table parsers.
- `RecipeService` may validate, fingerprint, and publish recipes. It must not
  evaluate recipes against raw tables or build review candidates.
- New authoring vocabulary belongs in `recipeSchema.ts`, validation in
  `recipeCodec.ts`, and matching / candidate behavior in Review candidate code.
- Do not add static `recipe -> templateId` association records. Recipe
  derivation goes through Review-owned `ReviewCandidate` building.
- `RecipeProvider` should only be introduced for true TypeScript provider
  behavior. JSON recipes are not providers.
- Review records the recipe fingerprint used for candidate review and selected
  `ReviewedTemplate` snapshots. Session does not store recipe JSON.
- After editing recipe JSON, run `npm run build:recipes` and commit the
  generated bundles with the source JSON.

## Do Not

- Do not call this layer `Rule`, `TemplateRule`, `Descriptor`, or
  `TemplateRecipe`.
- Do not move the Recipe catalog under Template ownership; Review owns
  interpreting Recipe snapshots against URI/content evidence.
- Do not call Recipe a rule or revive retired Rule naming; Recipe is the current
  passive physical-layout/logical-relation model.
- Do not let Recipe infer measurement family, roles, units, or structure;
  those facts come from canonical content evidence. In the current table
  projection, they are supplied by table-model production.
- Do not let Recipe read rows, services, Session, files, or table state.
- Do not let Template, Slice, or any compatibility bridge own Recipe
  interpretation.
