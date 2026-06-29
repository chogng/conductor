---
description: DataResource semantic library - passive aliases, canonical roles, units, axis tendencies, and row markers used by DataResource evidence production.
applyTo: 'resources/recipes/**,src/cs/workbench/services/dataResource/**'
---
# Semantic Library

Recipes are retired from the automatic Review path. The remaining recipe-owned
artifact is the DataResource semantic library JSON: a passive alias library used
by DataResource title matching while producing structured-content evidence.

The library is not a layout taxonomy, not a Template, not a Review selector, and
not an executable extraction plan.

## Ownership

`resources/recipes/v1/semantic-library.json` owns:

- title aliases such as `DataName`, `Vg`, `Vd`, `Id`, `Cgg`, `time`, and
  `frequency`;
- canonical measurement roles and canonical units;
- axis tendency hints (`x`, `dependent`, or `unknown`);
- measurement family/mode hints only when the role is specific enough;
- row marker aliases such as `DataName` and `DataValue`.

`DataResourceService` owns using that library to produce:

```txt
cell kind classification
  -> numeric runs
  -> column title spans
  -> X range candidates
  -> X group / line candidates
  -> data block candidates
  -> dependent value candidates
  -> binding candidates
  -> structured measurement blocks
```

Review consumes DataResource `bindingCandidates` directly. `SearchService`
does not perform semantic matching; it indexes and jumps to already-produced
structured content.

## Rules

- Keep the library passive JSON. Do not add TypeScript callbacks, service
  lookups, row parsing, or Review scoring rules.
- Prefer canonical title aliases over layout names. The library should say what
  a title means, not whether a table is `xy`, `xyyyy`, or `pairwiseXY`.
- Axis tendency is evidence, not an absolute decision. DataResource combines it
  with X evidence such as monotonicity, stable step, segmented/reset patterns,
  and aligned numeric ranges.
- Generic aliases such as `voltage` and `current` must stay conservative. They
  may identify column roles, but should not force an IV transfer/output mode
  without a specific title such as `Vg`, `Vd`, or equivalent aliases.
- Y/dependent values do not determine slicing boundaries. Dependent columns
  follow the accepted X row span and data block.
- Empty old recipe shells may remain only as inert data files. They must not be
  reintroduced into Review candidate derivation.

## Do Not

- Do not reintroduce `IRecipeService`, generated recipe bundles, or
  `reviewSelector` into automatic Review.
- Do not keep compatibility wrappers, aliases, or layout bridges for retired
  recipe selectors.
- Do not call `ISearchService` from DataResource semantic matching.
- Do not encode `simpleXY`, `sharedXMultiY`, or `pairwiseXY` as template-saving
  taxonomy. Persist executable ranges, columns, blocks, groups, and bindings.
