---
description: Recipe service - passive selector/projection recipes consumed by Slice to derive automatic Template snapshots.
applyTo: 'src/cs/workbench/services/recipe/**,resources/recipes/**,scripts/buildRecipeBundle.mjs,cli/resources/recipes.v1.json'
---
# Recipe

`Recipe` is a passive built-in recipe for deriving a concrete `Template` from
Assessment evidence. It is not a `Template`, not an executable extraction plan,
not a provider, and not a legacy rule engine.

```txt
Recipe[]
  -> Slice recipe materialization
  -> Template snapshot
  -> SlicePlan
  -> SliceRun
```

## Ownership

`IRecipeService` owns the recipe catalog snapshot, catalog fingerprint,
diagnostics, reload, and `onDidChangeRecipes` event. It does not evaluate raw
tables, score matches, materialize Template snapshots, execute slicing, or
mutate Session.

Slice owns recipe interpretation for automatic execution:

- `RecipeSelector` evaluation against `AssessmentEvidence`;
- `RecipeProjection` materialization into canonical block-aware `Template`
  snapshots;
- recipe candidate ordering and automatic-template choice.

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

Automatic recipe materialization lives in Slice files:

| File | Responsibility |
| --- | --- |
| `slice/common/recipeSelectorEvaluator.ts` | evaluates `RecipeSelector` against `AssessmentEvidence`. |
| `slice/common/recipeTemplateResolver.ts` | materializes matched captures into concrete `Template` snapshots. |

## Flow

```txt
resources/recipes/v1/index.json
  -> scripts/buildRecipeBundle.mjs
  -> builtinRecipes.generated.ts + cli/resources/recipes.v1.json
  -> RecipeService.getSnapshot()
  -> AutoSliceContribution observes recipe/session changes
  -> SliceService rereads current Assessment evidence
  -> Slice evaluates selector/projection
  -> Slice executes materialized Template snapshot
```

Recipe changes are owner-event-reread:

```txt
RecipeService reload/change
  -> onDidChangeRecipes
  -> AutoSliceContribution rereads SessionSnapshot
  -> ISliceService.enqueueAuto(...)
  -> stale queued/running automatic slices are dropped by recipe fingerprint
```

## Rules

- A `Recipe` must stay passive JSON with `id`, `version`, `priority`,
  `selector`, and `projection`.
- `RecipeSelector` describes which `AssessmentEvidence` can match.
- `RecipeProjection` describes how matched captures become a concrete
  `Template`.
- `RecipeService` may validate, fingerprint, and publish recipes. It must not
  evaluate recipes against raw tables or create candidates.
- New selector predicates belong in `recipeSelector.ts`, validation in
  `recipeCodec.ts`, and matching behavior in Slice's
  `recipeSelectorEvaluator.ts`.
- New projection nodes belong in `recipeProjection.ts`, validation in
  `recipeCodec.ts`, and materialization behavior in Slice's
  `recipeTemplateResolver.ts`.
- `RecipeAssociation` is only for static routing from a selector to an existing
  `templateId`; do not use it for selector/projection derivation.
- `RecipeProvider` should only be introduced for true TypeScript provider
  behavior. JSON recipes are not providers.
- `SliceRun.sourceAssessmentSignature` records the recipe fingerprint used for
  automatic Template materialization. Session does not store recipe JSON.
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
