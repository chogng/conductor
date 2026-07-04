# DataResource Rules

Automatic Review no longer consumes layout recipe catalogs. DataResource uses
rules to produce structured evidence and cut candidates from tabular
measurement data. Review consumes those candidates; Slice executes a reviewed
template.

`v1/template.json` documents the target authoring shape. The concrete runtime
files under `v1/*.json`, such as `iv.json`, `cv.json`, `frequency.json`, and
`transient.json`, use the same rule shape instead of keeping separate built-in
and user-only models.

`v1/supplement.json` documents auxiliary evidence rules. Supplements are not
cutting templates. They describe special structures that can strengthen or
bound evidence when those structures are actually observed.

## Rules

A rule is a cutting template. It provides the title evidence used by
DataResource while it decides how data is segmented and bound.

Rules describe facts and cutting behavior, such as:

- a stable rule id and a human-readable label. The id may be numeric, but it is
  identity only and must not encode sorting;
- a rule priority for sorting rules without changing rule identity;
- a result type. Review may project this type as `reviewedType` for a
  successful, unambiguous cut result, and product UI may display that projection
  as a badge;
- title aliases that identify X and Y columns, such as `Vg`, `Vd`, `Id`,
  `Cgg`, `time`, and `frequency`;
- rule-local X/Y outputs and human-readable labels;
- normalized term keys for each title alias, such as `Vg` -> `vg` and
  `Gate Voltage` -> `gatevoltage`;

One rule should map to one type. For example, `transfer` and `output` are
separate rules because their result definitions differ even when they share Y
terms.

Rules do not configure row-range, grouping, or binding algorithms. DataResource
owns those behaviors: X numeric runs determine row ranges, Y follows the bound
X range, and line/group candidates come from X segmentation.

A rule author should not be required to provide semantic roles such as gate
voltage or drain current. User-authored rules only need to say which title
terms belong to X and which title terms belong to Y, plus an optional type such
as `transfer` when the product should display a definition for successful cuts.
The algorithm treats that type as a result label, not as physical meaning. If a
reviewed result is mixed or lacks a type, Explorer does not synthesize a badge
from rule labels, file names, or physical roles.

Built-in physical domains are stricter than user-authored labels. They must not
force `transfer` or `output` by spreading the same ambiguous terms across
multiple flat X/Y lists. When a term carries physical responsibility, the
semantic layer must keep that responsibility visible: a sweep discriminator is
different from a weak voltage name, primary drain/channel current is different
from weak `Current` / `TotalCurrent`, leakage current is different from primary
current, `gm` is derived transfer evidence, and capacitance responses classify
the block as CV before IV mode is considered.

A rule must not contain a separate hand-written result preference list. The
algorithm derives result use order from rule priority and the cut candidates it
produces.

## Measurement Classification

DataResource decides measurement type from bounded table evidence in this
order:

1. Derive data rows from numeric core evidence. Explicit marker structures such
   as `DataName` / `DataValue` may restrict or explain candidate rows, but they
   do not define the data range without continuous numeric runs, an acceptable
   X candidate, and aligned dependent values. Metadata numbers outside the
   accepted numeric core do not compete with real table values.
2. Normalize repeated shapes. `XYXYXY` with identical X values and native
   `X, Y1, Y2, ... Yn` are both treated as shared-X, multi-Y data. The changing
   Y headers are line legends.
3. Determine the X role from numeric shape. A sweep X changes within each
   curve; a step or bias column is stable within a curve and changes across
   curves. Only the sweep X can decide IV mode.
4. Determine the Y family before IV mode. Capacitance responses such as `Cgg`,
   `Cgs`, `Cgd`, `Cgb`, `Capacitance`, `Cp`, or `Cs` classify CV even when the
   X sweep is `Vg`. IV mode is considered only after primary or weak current Y
   evidence proves the block is an IV response.
5. Decide transfer/output from the sweep X. `Vg` / `Vgs` / `Gate Voltage` /
   `IdVg` sweep means transfer; `Vd` / `Vds` / `Drain Voltage` / `IdVd` sweep
   means output. Generic voltage/current names, channel numbers, trace names,
   and file names are supporting evidence only.
6. Prefer direct X/Y pairs over auxiliary columns. A bound `Vg -> Id` pair
   outranks nearby `gm`, leakage, or other derived columns. `gm` can indicate a
   transfer-derived curve, but it is not primary transfer Y by itself.

## Supplements

A supplement is auxiliary evidence for unusual table structure. It cannot cut
data by itself and must not replace numeric-run, title, X range, or binding
evidence.

For example, some exports use a marker column:

```csv
DataName,Vg,Id
DataValue,0,1e-12
DataValue,0.1,2e-12
```

In that case a supplement may say that `DataName` marks a title row and
`DataValue` marks data rows. The supplement is usable only when the structure is
consistent: the marker appears in the same marker column, the marked title row
contains matched X/Y titles, and the marked data rows contain numeric runs in
the matched columns.

If those checks fail, the supplement should be ignored. A loose marker match
must not cause metadata, notes, or malformed rows to be cut as data.

## Result Preference Derivation

Result preference is not a separate JSON section. It is an algorithm result
derived after rules have already cut the data and produced usable outputs.

The algorithm can use:

- the matched rule's `priority`;
- the cut candidates' confidence and diagnostics;
- the X/Y outputs present in each cut result;
- the stable order of X/Y outputs inside the rule when confidence is otherwise
  tied.

The JSON authoring surface should not contain `rulePreferences`. If a value
changes how rows are detected, how X is chosen, how Y is bound, or how groups
are created, it belongs in `rules`. If a value only ranks already-cut results,
it belongs in the algorithm's derived candidate ordering, not in the rules JSON.

## Flow

```txt
raw cells
  -> rules provide X/Y title evidence
  -> DataResource cuts data into X ranges, groups, data blocks, and bindings
  -> Review evaluates the cut candidates
  -> algorithm derives reviewed-output use order from rule priority and candidates
  -> Slice executes the selected reviewed template
```

Do not add layout taxonomy such as `simpleXY`, `sharedXMultiY`, or
`pairwiseXY` back into rules or derived preferences. Rules describe how to cut
data by naming X/Y evidence; DataResource owns the cutting algorithm and ranks
the cut results.
