---
description: Recipe service - passive selector/projection recipes consumed by Review candidate providers to derive Template drafts.
applyTo: 'src/cs/workbench/services/recipe/**,resources/recipes/**,scripts/buildRecipeBundle.mjs,cli/resources/recipes.v1.json'
---
# Recipe

`Recipe` is a passive built-in recipe for deriving a concrete `Template` from
Assessment evidence. It is not a `Template`, not an executable extraction plan,
not a provider, and not a legacy rule engine.

```txt
Recipe[]
  -> Review candidate provider
  -> TemplateDraft / Template
  -> Review
  -> Slice
```

## Ownership

`IRecipeService` owns the recipe catalog snapshot, catalog fingerprint,
diagnostics, reload, and `onDidChangeRecipes` event. It does not evaluate raw
tables, score matches, materialize Template snapshots, execute slicing, or
mutate Session.

Review candidate providers own recipe interpretation for automatic review:

- `RecipeSelector` evaluation against `RawTableEvidence`;
- `RecipeProjection` materialization into canonical block-aware `Template`
  snapshots;
- materialized-template ordering and automatic-template choice.

Assessment owns the evidence consumed by recipe interpretation. Recipe must not
infer measurement family, roles, units, or table structure from raw rows.

## Core Files

| File | Responsibility |
| --- | --- |
| `common/recipe.ts` | `Recipe`, `RecipeSnapshot`, diagnostics, and `IRecipeService` contract. |
| `common/recipeSelector.ts` | finite selector DSL for matching Assessment evidence. |
| `common/recipeProjection.ts` | finite projection DSL for turning selector captures into a `Template`. |
| `common/recipeAssociation.ts` | reserved static `selector -> templateId` association shape only. Do not use for derivation recipes. |
| `common/recipeCodec.ts` | JSON normalization, validation diagnostics, stable fingerprinting. |
| `common/builtinRecipes.generated.ts` | generated built-in recipe bundle. Do not edit manually. |
| `browser/recipeService.ts` | thin injectable owner for the built-in recipe snapshot and change event. |
| `resources/recipes/v1/index.json` | ordered source bundle index. |
| `resources/recipes/v1/**/*.json` | hand-authored passive recipe JSON. |
| `scripts/buildRecipeBundle.mjs` | builds generated TypeScript and CLI recipe bundles. |
| `cli/resources/recipes.v1.json` | generated CLI bundle. Do not edit manually. |

Automatic recipe materialization lives in Review candidate-provider code.
Template Resolution is not part of the primary Recipe -> TemplateDraft/Template
-> Review -> Slice flow. While the legacy compatibility bridge exists, it may
consume the Review-owned pure provider only to write old summary records; it
must not own a second selector/materialization implementation:

| File | Responsibility |
| --- | --- |
| `review/common/recipeSelectorEvaluator.ts` | evaluates `RecipeSelector` against `RawTableEvidence`. |
| `review/common/recipeTemplateDraftProvider.ts` | materializes matched captures into concrete `TemplateDraft` snapshots. |
| `review/common/automaticTemplateDraftProvider.ts` | combines Recipe and UserTemplate draft providers into Review-owned automatic candidates. |

## Flow

```txt
resources/recipes/v1/index.json
  -> scripts/buildRecipeBundle.mjs
  -> builtinRecipes.generated.ts + cli/resources/recipes.v1.json
  -> RecipeService.getSnapshot()
  -> ReviewContribution observes recipe/evidence/UserTemplate changes
  -> ReviewService rereads current raw table evidence
  -> Review candidate provider evaluates selector/projection
  -> ReviewDecision stores selected ReviewedTemplate snapshot when ready
  -> ReviewApply submits SliceRequest only when systemRecommended
```

Recipe changes are owner-event-reread:

```txt
RecipeService reload/change
  -> onDidChangeRecipes
  -> ReviewContribution rereads SessionSnapshot
  -> IReviewService derives affected reviews
  -> Session reviewChanged
```

## Rules

- A `Recipe` must stay passive JSON with `id`, `version`, `priority`,
  `selector`, and `projection`.
- `RecipeSelector` describes which `RawTableEvidence` can match.
- `RecipeProjection` describes how matched captures become a concrete
  `Template`.
- `RecipeService` may validate, fingerprint, and publish recipes. It must not
  evaluate recipes against raw tables or materialize templates.
- New selector predicates belong in `recipeSelector.ts`, validation in
  `recipeCodec.ts`, and matching behavior in Review candidate-provider code.
- New projection nodes belong in `recipeProjection.ts`, validation in
  `recipeCodec.ts`, and materialization behavior in Review candidate-provider
  code.
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
- Do not move Recipe under Template ownership.
- Do not call Recipe a rule or revive legacy Rule naming; Recipe is the current
  passive selector/projection model.
- Do not let Recipe infer measurement family, roles, units, or table structure;
  those facts belong to Assessment.
- Do not let Recipe read rows, services, Session, files, or table state.
- Do not let TemplateService own Recipe interpretation.
