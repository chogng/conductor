---
description: Recipe service - passive selector/projection recipes consumed by Template materializers to derive Template drafts.
applyTo: 'src/cs/workbench/services/recipe/**,resources/recipes/**,scripts/buildRecipeBundle.mjs,cli/resources/recipes.v1.json'
---
# Recipe

`Recipe` is a passive built-in recipe for deriving a concrete `Template` from
table facts. It is not a `Template`, not an executable extraction plan, not a
provider, and not a legacy rule engine.

```txt
Recipe[]
  + TableFacts
  -> Template materializer
  -> TemplateDraft / Template
  -> Review
  -> Slice
```

## Ownership

`IRecipeService` owns the recipe catalog snapshot, catalog fingerprint,
diagnostics, reload, and `onDidChangeRecipes` event. It does not evaluate raw
tables, score matches, materialize Template snapshots, execute slicing, or
mutate Session.

Template materializers own recipe interpretation:

- `RecipeSelector` evaluation against table facts;
- `RecipeProjection` materialization into canonical block-aware `Template`
  snapshots;
- materialized-template ordering before Review.

Recipe consumes only table facts through Template materializers. Recipe must
not infer measurement family, roles, units, or table structure from raw rows.

## Core Files

| File | Responsibility |
| --- | --- |
| `common/recipe.ts` | `Recipe`, `RecipeSnapshot`, diagnostics, and `IRecipeService` contract. |
| `common/recipeSelector.ts` | finite selector DSL for matching table facts. |
| `common/recipeProjection.ts` | finite projection DSL for turning selector captures into a `Template`. |
| `common/recipeAssociation.ts` | reserved static `selector -> templateId` association shape only. Do not use for derivation recipes. |
| `common/recipeCodec.ts` | JSON normalization, validation diagnostics, stable fingerprinting. |
| `common/builtinRecipes.generated.ts` | generated built-in recipe bundle. Do not edit manually. |
| `browser/recipeService.ts` | thin injectable owner for the built-in recipe snapshot and change event. |
| `resources/recipes/v1/index.json` | ordered source bundle index. |
| `resources/recipes/v1/**/*.json` | hand-authored passive recipe JSON. |
| `scripts/buildRecipeBundle.mjs` | builds generated TypeScript and CLI recipe bundles. |
| `cli/resources/recipes.v1.json` | generated CLI bundle. Do not edit manually. |

Automatic recipe materialization belongs in Template. Template Resolution is
retired and must not be reintroduced as a compatibility bridge or second
selector/materialization implementation:

| File | Responsibility |
| --- | --- |
| `template/common/recipeSelectorEvaluator.ts` | target home for evaluating `RecipeSelector` against table facts. |
| `template/common/recipeTemplateMaterializer.ts` | target home for materializing matched captures into concrete `TemplateDraft` snapshots. |
| `template/common/automaticTemplateMaterializer.ts` | target home for combining Recipe and UserTemplate materializers into automatic candidates. |

## Flow

```txt
resources/recipes/v1/index.json
  -> scripts/buildRecipeBundle.mjs
  -> builtinRecipes.generated.ts + cli/resources/recipes.v1.json
  -> RecipeService.getSnapshot()
  -> Template materializer observes recipe/table-fact/UserTemplate changes
  -> Template materializer evaluates selector/projection
  -> ReviewService reviews materialized candidates
  -> ReviewDecision stores selected ReviewedTemplate snapshot when ready
  -> ReviewApply submits SliceRequest only when systemRecommended
```

Recipe changes are owner-event-reread:

```txt
RecipeService reload/change
  -> onDidChangeRecipes
  -> Template materialization refreshes affected candidates
  -> IReviewService reviews affected candidates
  -> Session reviewChanged
```

## Rules

- A `Recipe` must stay passive JSON with `id`, `version`, `priority`,
  `selector`, and `projection`.
- `RecipeSelector` describes which table facts can match.
- `RecipeProjection` describes how matched captures become a concrete
  `Template`.
- `RecipeService` may validate, fingerprint, and publish recipes. It must not
  evaluate recipes against raw tables or materialize templates.
- New selector predicates belong in `recipeSelector.ts`, validation in
  `recipeCodec.ts`, and matching behavior in Template materializer code.
- New projection nodes belong in `recipeProjection.ts`, validation in
  `recipeCodec.ts`, and materialization behavior in Template materializer code.
- `RecipeAssociation` is only for static routing from a selector to an existing
  `templateId`; do not use it for selector/projection derivation.
- `RecipeProvider` should only be introduced for true TypeScript provider
  behavior. JSON recipes are not providers.
- Review records the recipe fingerprint used for candidate review and selected
  `ReviewedTemplate` snapshots. Session does not store recipe JSON.
- After editing recipe JSON, run `npm run build:recipes` and commit the
  generated bundles with the source JSON.

## Do Not

- Do not call this layer `Rule`, `TemplateRule`, `Descriptor`, or
  `TemplateRecipe`.
- Do not move the Recipe catalog under Template ownership; Template only owns
  interpreting Recipe snapshots against table facts.
- Do not call Recipe a rule or revive legacy Rule naming; Recipe is the current
  passive selector/projection model.
- Do not let Recipe infer measurement family, roles, units, or table structure;
  those facts come from table-fact production.
- Do not let Recipe read rows, services, Session, files, or table state.
- Do not let Review, Slice, or any compatibility bridge own Recipe interpretation.
