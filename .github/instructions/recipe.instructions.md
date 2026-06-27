---
description: Recipe service - passive selector/projection recipes consumed by Review candidate builders to derive review candidates.
applyTo: 'src/cs/workbench/services/recipe/**,resources/recipes/**,scripts/buildRecipeBundle.mjs,cli/resources/recipes.v1.json'
---
# Recipe

`Recipe` is a passive built-in recipe for deriving a `ReviewCandidate`
from content evidence. It is not a `Template`, not an executable extraction
plan, not a provider, and not a retired rule engine.

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
tables, score matches, build review candidates, execute slicing, or
mutate Session.

Review candidate builders own recipe interpretation:

- `RecipeSelector` evaluation against `ReviewContext.evidence`;
- `RecipeProjection` interpretation into a candidate Template
  interpretation;
- candidate ordering before Review scoring.

Recipe consumes only ReviewContext evidence through Review-owned candidate
builders. Recipe must not import table-model APIs or infer measurement family,
roles, units, or table structure from raw rows.

## Core Files

| File | Responsibility |
| --- | --- |
| `common/recipe.ts` | `Recipe`, `RecipeSnapshot`, diagnostics, and `IRecipeService` contract. |
| `common/recipeSelector.ts` | finite selector DSL and recipe-owned vocabulary for matching content evidence; no TableModel imports. |
| `common/recipeProjection.ts` | finite projection DSL for describing how selector captures become a candidate Template interpretation. |
| `common/recipeCodec.ts` | JSON normalization, validation diagnostics, stable fingerprinting. |
| `common/builtinRecipes.generated.ts` | generated built-in recipe bundle. Do not edit manually. |
| `browser/recipeService.ts` | thin injectable owner for the built-in recipe snapshot and change event. |
| `resources/recipes/v1/index.json` | ordered source bundle index. |
| `resources/recipes/v1/**/*.json` | hand-authored passive recipe JSON. |
| `scripts/buildRecipeBundle.mjs` | builds generated TypeScript and CLI recipe bundles. |
| `cli/resources/recipes.v1.json` | generated CLI bundle. Do not edit manually. |

Automatic recipe candidate derivation belongs in Review. Template Resolution is
retired and must not be reintroduced as a compatibility bridge or second
selector/candidate implementation:

| File | Responsibility |
| --- | --- |
| `review/common/reviewSelector.ts` | target home for evaluating `RecipeSelector` against `ReviewContext.evidence`. |
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
  -> RecipeService.getSnapshot()
  -> ReviewService observes recipe/content-evidence/UserTemplate changes
  -> ReviewService builds ReviewCandidate values from selector/projection
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

- A `Recipe` must stay passive JSON with `id`, `version`, `priority`,
  `selector`, and `projection`.
- `RecipeSelector` describes which content evidence can match, using
  recipe-owned vocabulary.
- `RecipeProjection` describes how matched captures become a candidate
  Template interpretation inside `ReviewCandidate`.
- `RecipeService` may validate, fingerprint, and publish recipes. It must not
  evaluate recipes against raw tables or build review candidates.
- New selector predicates and DSL vocabulary belong in `recipeSelector.ts`, validation in
  `recipeCodec.ts`, and matching behavior in Review candidate code.
- New projection nodes belong in `recipeProjection.ts`, validation in
  `recipeCodec.ts`, and candidate derivation behavior in Review candidate code.
- Do not add static `selector -> templateId` association records. Recipe
  selector/projection derivation goes through Review-owned
  `ReviewCandidate` building.
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
  passive selector/projection model.
- Do not let Recipe infer measurement family, roles, units, or structure;
  those facts come from canonical content evidence. In the current table
  projection, they are supplied by table-model production.
- Do not let Recipe read rows, services, Session, files, or table state.
- Do not let Template, Slice, or any compatibility bridge own Recipe
  interpretation.
