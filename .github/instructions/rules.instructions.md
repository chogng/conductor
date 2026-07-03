---
description: DataResource semantic rules - passive aliases, canonical roles, units, axis tendencies, and row markers used by DataResource evidence production.
applyTo: 'resources/rules/**,src/cs/workbench/services/dataResource/**'
---
# Semantic Rules

Recipes are retired from the automatic Review path. The remaining built-in
rules artifacts are the DataResource semantic rules JSON files: passive alias
and domain rules used by DataResource title matching while producing
structured-content evidence.

The rules are not a layout taxonomy, not a Template, not a Review selector, and
not an executable extraction plan.

## Ownership

`resources/rules/v1/*.json` owns one domain, format, or shared rule boundary
per file:

- title aliases such as `DataName`, `Vg`, `Vd`, `Id`, `Cgg`, `time`, and
  `frequency`;
- canonical measurement roles and canonical units;
- axis tendency hints (`x`, `dependent`, or `unknown`);
- measurement family/mode hints only when the role is specific enough;
- row marker aliases such as B1500 `DataName` and `DataValue` when they are
  domain evidence for the owning rule file.
- built-in semantic domain rules such as `iv`, `cv`, `frequency`,
  `transient`, and `generic`;
- domain-owned X intent and role-priority profiles.

`DataResourceService` owns using those rules to produce:

```txt
cell kind classification
  -> numeric runs
  -> column title spans
  -> selected semantic domain
  -> X range candidates ranked by that domain's intent/role profile
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

- Keep the rules passive JSON. Do not add TypeScript callbacks, service
  lookups, row parsing, or Review scoring rules.
- Put a built-in domain's Proof/X/Y evidence and X ranking profile in that
  domain's own rules file. Shared title aliases belong in `core.json`; row
  markers that are domain evidence, such as B1500 IV `DataName` and
  `DataValue`, belong with the owning domain rules.
- Prefer canonical title aliases over layout names. The rules should say what
  a title means, not whether a table is `xy`, `xyyyy`, or `pairwiseXY`.
- Axis tendency is evidence, not an absolute decision. DataResource combines it
  with X evidence such as monotonicity, stable step, segmented/reset patterns,
  and aligned numeric ranges.
- Built-in semantic domain intent and role priorities are domain-owned evidence
  used only after DataResource chooses a complete semantic domain. Do not add a
  global X intent priority setting beside the domain priority model.
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
