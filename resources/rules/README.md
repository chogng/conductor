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
- a result badge. Product UI may call this a definition, but the JSON field is
  `badge` because it becomes the badge attached to a successful cut result;
- title aliases that identify X and Y columns, such as `Vg`, `Vd`, `Id`,
  `Cgg`, `time`, and `frequency`;
- rule-local X/Y outputs and human-readable labels;
- normalized term keys for each title alias, such as `Vg` -> `vg` and
  `Gate Voltage` -> `gatevoltage`;

One rule should map to one badge. For example, `transfer` and `output` are
separate rules because their result definitions differ even when they share Y
terms.

Rules do not configure row-range, grouping, or binding algorithms. DataResource
owns those behaviors: X numeric runs determine row ranges, Y follows the bound
X range, and line/group candidates come from X segmentation.

A rule author should not be required to provide semantic roles such as gate
voltage or drain current. User-authored rules only need to say which title
terms belong to X and which title terms belong to Y, plus an optional badge
such as `transfer` when the product should display a definition for successful
cuts. The algorithm treats that badge as a label, not as physical meaning.

A rule must not contain a separate hand-written result preference list. The
algorithm derives result use order from rule priority and the cut candidates it
produces.

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
