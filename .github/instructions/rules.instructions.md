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
  -> explicit DataName/DataValue boundary evidence
  -> repeated XY header interpretation (axis suffix, continuous semantic keyword matches, legend labels)
  -> column title spans
  -> selected semantic domain
  -> X range candidates ranked by that domain's intent/role profile
  -> sweep / step / condition role evidence from numeric shape
  -> X group / line candidates
  -> data block candidates
  -> identical-X repeated pair promotion to shared-X blocks
  -> dependent value candidates
  -> binding candidates
  -> explicit data-row repeated section binding
  -> aligned block header row projection
  -> direct X/Y pair rule scoring before auxiliary dependent headers
  -> structured measurement blocks
```

Review consumes DataResource `bindingCandidates` directly. `SearchService`
does not perform semantic matching; it indexes and jumps to already-produced
structured content.

## Measurement Classification

DataResource must classify measurements from bounded data evidence, not from a
single matched word. The order is:

1. Derive the data region from numeric core evidence first. Explicit
   `DataName` / `DataValue` row markers may restrict or explain candidate rows,
   but they do not define data range without continuous numeric runs, an
   acceptable X candidate, and aligned dependent values. Metadata numeric rows
   outside the accepted numeric core do not compete with real data.
2. Interpret repeated tables by numeric shape. `XYXYXY` pairs with identical X
   values are promoted to one shared-X, multi-Y block; the dependent Y headers
   become line legends. Native `X, Y1, Y2, ... Yn` tables already have that
   shape and should be treated the same way.
3. Classify X data roles from shape before using X names for mode decisions:
   a sweep column changes continuously within the curve, a step/bias column is
   stable within each curve and changes across curves, and an unresolved
   voltage column remains unknown.
4. Classify the dependent response family before deciding IV mode. Capacitance
   responses such as `Cgg`, `Cgs`, `Cgd`, `Cgb`, `Capacitance`, `Cp`, or `Cs`
   classify the block as CV even when X is `Vg`. Primary IV current responses
   such as `Id`, `Ids`, `Drain Current`, and `Channel Current` are stronger
   IV evidence than weak generic current responses such as `Current`,
   `TotalCurrent`, or `CH1 Current`.
5. Decide `transfer` / `output` only for IV blocks whose X column is the real
   sweep. Gate-voltage sweeps (`Vg`, `Vgs`, `Gate Voltage`, `IdVg`) indicate
   transfer; drain-voltage sweeps (`Vd`, `Vds`, `Drain Voltage`, `IdVd`)
   indicate output. Generic `Voltage`, channel labels, and wiring-dependent
   names are weak X evidence and should produce IV unknown mode unless bound
   proof establishes the physical role.
6. Score direct X/Y evidence before auxiliary dependent headers. A clear
   adjacent or primary `Vg -> Id` pair should outrank nearby `gm`, leakage, or
   other derived/auxiliary columns. `gm` / `Transconductance` is
   transfer-derived evidence, not a primary transfer Y. `Ig` and `Is` are
   leakage/source-current responses and must not prove primary transfer/output
   by themselves.
7. Apply source weighting to semantic words. Bound axis labels and column
   headers are strongest; DataName/table section headers are strong when they
   own the data interval; trace names and measurement names are supporting
   evidence; file names never decide mode alone.

Header matching may use continuous normalized keyword matches inside a header
part, such as `c(g:g)(CV_n256_ac_des)` producing a capacitance response plus a
CV supporting hint, or `drain TotalCurrent(IdVg_n938_des)` producing weak
current plus an `IdVg` sweep hint. The Y header remains the default legend; a
parenthesized or changing substring is only auxiliary semantic evidence. This
is not delimiter-driven tokenization. Short
aliases such as `id`, `vg`, and `vd` must still be guarded by source, role, and
numeric-shape evidence so they do not match unrelated strings such as
`device_id`, `valid`, or `solid`.

When rule terms need different responsibility, do not duplicate the same flat
term into multiple built-in rules to force a result. Model the responsibility
explicitly in the semantic layer, for example: `x.sweepDiscriminator`,
`x.weakVoltage`, `y.primaryCurrentStrong`, `y.primaryCurrentWeak`,
`y.leakage`, `y.derivedGm`, and `y.capacitance`. Mode is decided by the sweep
X, but the Y family must prove the block is eligible for that mode.

Keep these guards in place:

- `Vg` / `Vd` in a bias or step column is not the sweep and must not decide
  transfer/output.
- `IdVg` / `IdVd` in a file name, trace title, or legend is supporting
  evidence only, not a strong axis by itself.
- CV Y terms win family classification before IV transfer/output mode is
  considered.
- `TotalCurrent` is weaker than explicit drain/channel current unless the
  bound source proves it is the drain response.
- `CH1` / `CH2` voltage/current names require proof or wiring context before
  being treated as gate or drain roles.
- Voltage/current polarity and sweep direction do not change transfer/output
  mode.

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
- Do not treat all X/Y terms as equally strong. When a term can mean primary
  response, weak response, leakage, derived quantity, capacitance, sweep, or
  bias, preserve that responsibility so DataResource can rank evidence instead
  of widening transfer/output aliases.
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
