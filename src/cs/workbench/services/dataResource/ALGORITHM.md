# Data Resource Evidence Algorithm

This document captures the target algorithm boundary for tabular measurement
data. The key decision is that `DataResource` should produce structured
evidence and candidates, while `Review` evaluates those candidates and decides
whether a template can be recommended.

## Problem

Measurement data files commonly appear in three forms:

- the first row is the column-label row, followed immediately by numeric data;
- a large metadata block appears first, followed later by the real data region.
- there are no metadata or label rows at all, and the file starts directly with
  numeric data.

The metadata block should not be treated as the table header. It may contain
test setup, channel names, sweep configuration, graph settings, and instrument
notes. The algorithm should first find usable numeric regions, then infer axis
and binding candidates from those regions.

Headerless numeric data is harder because it has no semantic hints. It should
still be evaluable: `DataResource` can detect numeric runs, X-like fixed-step
ranges, Y-like aligned ranges, and binding candidates. Review should lower the
semantic confidence when names and units are absent, but it should not treat the
file as missing data.

The current failure mode is usually not that Slice cuts the table incorrectly.
Slice can only execute a reviewed template. When Review cannot evaluate a file,
the more likely cause is that the structured evidence before Review is
incomplete: data regions, X ranges, dependent value columns, or X/value
bindings were not produced with enough confidence.

## Ownership

```txt
Table
  -> parse physical rows and cells

DataResource
  -> segment numeric regions
  -> detect XRangeCandidate values
  -> detect XGroupCandidate / line values
  -> generate DataBlockCandidate values
  -> detect DependentValueCandidate values
  -> generate BindingCandidate values
  -> expose structured evidence with confidence and reasons

Review
  -> evaluate candidates
  -> rank ambiguity
  -> decide ready / needs adjustment / invalid
  -> materialize a reviewed Template when ready

Template
  -> store confirmed executable ranges and axis bindings

Slice
  -> execute the reviewed Template
```

`dataRange` is not the algorithm. It is one output of the segmentation layer:
the continuous area that is usable as data. Review should not rediscover
`dataRange` from raw rows, and Slice should not infer headers, roles, or layout.

## Core Principle

Fixed step is not the definition of X, but it is a high-confidence feature for
detecting X ranges in test data.

Instrument sweeps are usually generated from either:

```txt
start / stop / step
start / stop / points
```

After export, the X values often appear as:

- long continuous numeric sequences;
- monotonic ascending or descending values;
- highly stable adjacent deltas;
- segmented constant-step runs inside repeated sweep blocks;
- repeated X patterns across blocks or adjacent X/Y pairs;
- row-aligned ranges next to one or more dependent value columns.

Therefore:

```txt
fixed-step numeric sequence
  -> strong X range candidate
```

The candidate should not be accepted as final X by `DataResource` alone. Review
must still evaluate ambiguity and competing bindings.

The second high-confidence signal is local title / info-row evidence. For a
continuous numeric run, if the nearest title or info cell above the run matches
the semantic title library, the numeric run below that title usually inherits
the title's data type.

Typical shape:

```txt
row n:   Vg
row n+1: -1.0
row n+2: -0.9
...
```

The numeric run from `row n+1` downward can be strongly annotated as `Vg` data.
The title must not cover the column indefinitely. Its span is limited to the
continuous numeric run below it and should stop at an empty row, a clear
non-numeric block, the next title/info row, a repeated-block boundary, or a
column-structure break.

If the X fixed-step / monotonic evidence is strong, title evidence is a
reinforcement. If the X step is irregular, title evidence becomes the second
high-confidence signal: titles such as `Vg`, `Vd`, `time`, `frequency`, and
`bias` can promote the corresponding numeric run to an X candidate; titles such
as `Id`, `Ig`, and `capacitance` usually point to dependent values.

Proof titles are auxiliary rule evidence, not extracted Y columns. When a proof
title points at numeric data such as `CH2 Voltage`, `DataResource` validates the
numeric shape against the accepted X groups before it becomes strong rule
evidence: each X group must hold one proof value within instrument-export
precision, allowing small numeric jitter relative to the proof column's full
span, and the group representatives must be constant or monotonic stepped
values. A globally constant proof validates the auxiliary condition column, but
it does not distinguish IV output from IV transfer unless the rule also has
exclusive mode evidence such as `Output` or `Transfer_DB`. A monotonic stepped
proof means the primary X sweep repeats under different bias conditions, so it
is strong IV output proof.

This requires a fast canonical title library owned by `DataResource`. It should
not be a Recipe responsibility or a temporary rule inside Review scoring.
`DataResource` emits title matches as structured evidence, and Review consumes
that evidence.

## Candidate Model

`DataResource` should produce candidates that describe evidence, not final
decisions.

```ts
type XRangeCandidate = {
  readonly column: number;
  readonly startRow: number;
  readonly endRow: number;
  readonly direction: "ascending" | "descending" | "mixed";
  readonly stepKind: "constant" | "nearlyConstant" | "pointsDerived" | "segmentedConstant" | "ratioConstant";
  readonly step?: number;
  readonly pointCount: number;
  readonly confidence: number;
  readonly reasons: readonly string[];
};
```

```ts
type XGroupCandidate = {
  readonly xRangeCandidateId: string;
  readonly startRow: number;
  readonly endRow: number;
  readonly direction: "ascending" | "descending";
  readonly groupKind: "singleMonotonicRun" | "directionBreak" | "reset" | "repeatedPattern";
  readonly lineIndex: number;
  readonly confidence: number;
  readonly reasons: readonly string[];
};
```

```ts
type DataBlockCandidate = {
  readonly xRangeCandidateId: string;
  readonly xGroupCandidateIds: readonly string[];
  readonly startRow: number;
  readonly endRow: number;
  readonly startCol: number;
  readonly endCol: number;
  readonly xColumn: number;
  readonly dependentColumns: readonly number[];
  readonly separatorColumns: readonly number[];
  readonly columnDirection: "rightPreferred" | "leftObserved" | "mixed";
  readonly confidence: number;
  readonly reasons: readonly string[];
};
```

```ts
type DependentValueCandidate = {
  readonly column: number;
  readonly xRangeCandidateIds: readonly string[];
  readonly dataBlockCandidateIds: readonly string[];
  readonly numericCoverage: number;
  readonly confidence: number;
  readonly reasons: readonly string[];
};
```

```ts
type ColumnTitleSpanEvidence = {
  readonly titleCell: {
    readonly row: number;
    readonly column: number;
    readonly text: string;
  };
  readonly targetColumn: number;
  readonly startRow: number;
  readonly endRow: number;
  readonly normalizedTitle: string;
  readonly canonicalRole: "unknown";
  readonly axisTendency: "x" | "dependent" | "unknown";
	readonly semanticRules: readonly {
	  readonly id: string;
	  readonly label: string;
	  readonly type?: string;
	  readonly axisTendency: "x" | "dependent" | "unknown";
    readonly priority: number;
    readonly priorityIndex: number;
    readonly source: "builtin" | "user";
  }[];
  readonly confidence: number;
  readonly reasons: readonly string[];
};
```

```ts
type BindingCandidate = {
  readonly xRangeCandidateIds: readonly string[];
  readonly dependentValueCandidateIds: readonly string[];
  readonly relation:
    | "oneX-oneY"
    | "oneX-manyY"
    | "manyXYpairs"
    | "segmentedSweep"
    | "matrixEncoded";
  readonly confidence: number;
  readonly ambiguityCodes: readonly string[];
  readonly reasons: readonly string[];
};
```

Layout names such as `xy`, `xyyyy`, or `xyxyxy` should be treated as derived
explanations over binding candidates. They should not be the first thing the
algorithm tries to classify.

## Detection Flow

```txt
raw table rows
  -> normalize cells
  -> classify cell kinds: empty / text / number
  -> find continuous numeric runs by column
  -> segment column blocks first
  -> use row markers and text rows as boundary context
  -> match nearby column title spans through the title library
  -> group compatible runs into data regions
  -> score XRangeCandidate values
  -> derive XGroupCandidate / line candidates from monotonic X segments
  -> derive DataBlockCandidate values around high-confidence X ranges
  -> validate numeric proof columns against each block's X groups
  -> collect DependentValueCandidate values inside data blocks
  -> generate BindingCandidate values
  -> expose structured evidence
  -> Review evaluates evidence and materializes Template
```

### Column-first Segmentation

Rows and columns are not the same kind of signal in this algorithm.

Columns are better for identifying data type and continuous data runs: whether
a column is X, dependent value, marker column, or metadata column. Rows are
better for identifying block transitions: where an info block enters a data
block, where a title/info row appears, or where a new repeated block starts.

The segmentation rule should be:

```txt
Column-first, row-boundary-assisted segmentation.
```

In other words, find numeric runs and column blocks by column first, then use
row text/info markers as boundary context. A single text cell must not
invalidate a whole row. For example:

```txt
DataValue, 0,   1e-12, 2e-12
DataValue, 0.1, 2e-12, 3e-12
```

The first column is a row-level marker column, not a data column. It must not
invalidate the numeric runs in columns 2, 3, and 4. The algorithm should see
the continuous numeric runs by column, then treat the first-column text as row
boundary or row-marker evidence.

A mixed text/numeric row is not automatically outside the data region. The
algorithm should inspect the numeric core: if most target columns are numeric
and those columns form continuous runs vertically, the row can still belong to
the data region.

A high-confidence data boundary usually has at least one of these signals:

- the first info cell or row marker at the data boundary is meaningful, such as
  `DataName`, `DataValue`, `Vg`, or `Id`;
- the data columns contain an identifiable X pattern, such as fixed step,
  monotonicity, segmented sweep, or repeated pattern.

If either signal exists, candidate generation can continue. If neither exists,
especially when text/numeric cells are mixed, column blocks are discontinuous,
the X pattern is absent, and no title/info marker exists, `DataResource` should
emit dirty / ambiguous evidence. Review should not automatically recommend the
data as ready.

### Numeric Runs

The first pass should scan primarily by column to find continuous numeric runs.
Each run should record:

- start row and end row;
- numeric coverage;
- empty-cell density;
- finite number count;
- monotonicity;
- adjacent delta distribution;
- repeated pattern signature;
- source header or metadata references when present.

This pass should naturally skip large metadata blocks because those rows do not
form long numeric runs.

### Column Title Span Matching

For each numeric run, `DataResource` should look upward for nearby title or
info evidence. The most common signal is the row immediately above the numeric
run. The first cell in that row may be an info-row marker, such as `DataName`;
the per-column title is then read from the target column in the same row. The
first cell may also be a single-column or block-level title.

The matching logic should first identify row-level info markers, then read the
column title from the target column in that row. Without a row marker, it should
look for the nearest non-empty title cell above the same column. Metadata-block
cases may allow a limited upward distance, but the search must not cross the
next numeric/data block.

Matching flow:

```txt
numeric run
  -> inspect the row immediately above the run
  -> if the row has an info marker, read the title cell at the target column
  -> otherwise find nearest title/info cell above the same column
  -> normalize title into a semantic term key
  -> lookup rule title aliases by that key
  -> emit ColumnTitleSpanEvidence
```

### Semantic Tokens, Keys, and Aliases

Use one vocabulary for the title-matching path:

- `token`: raw text typed by a user, configured by a rule author, or read from a
  column title cell;
- `alias`: preserved configured vocabulary. Built-in rule files store aliases
  explicitly; settings/user edits store typed terms as user alias patches under
  `templateSemanticPatches.terms`;
- `key`: normalized semantic identity produced by `toSemanticTermKey(...)`.

The key is not a user-authored replacement for the typed text. It is a lookup
and dedupe value. `toSemanticTermKey(...)` trims text, normalizes micro and ohm
symbols, lowercases, and removes non-letter/non-number separators. Examples:

```txt
V_G_S        -> key vgs
V-G-S        -> key vgs
Gate Voltage -> key gatevoltage
Drive-Bias   -> key drivebias
```

When compiling built-in semantic rules, the JSON source may include both a
declared `key` and an `aliases` list. This is the only place where authors write
an explicit key. Every alias must normalize to the declared key; otherwise the
rule file is invalid. The compiled matcher stores the alias text for traceable
vocabulary and indexes it by the derived key.

When compiling settings or user rule terms, do not ask the user for a key and do
not persist the normalized form as the visible term. The typed term is normalized
first. If the key already exists, the typed term is stored as a user alias under
that key. If the key does not exist, a user term patch creates that key and uses
the typed term as its first alias. When the input happens inside an existing
rule's Proof, X, or Y area, the same operation also stores a
`templateSemanticPatches` rule link for that key. Proof links participate in
title matching as `axisTendency: unknown` auxiliary rule evidence; X and Y
links provide axis tendency.
If several aliases derive the same key, they merge under that key with all
matching rule records preserved.

When reading a file column title, the title cell is a transient token. It is
normalized into a key for lookup, but it is not added to any alias list and is
not promoted to a rule key. A title match emits evidence only:
`normalizedTitle` stores the key that matched, and `semanticRules` stores the
rule matches that were already configured.

Axis ownership comes from the matched rule record, not from the token storage
shape:

- a key mapped only by X aliases emits `axisTendency: x`;
- a key mapped only by Y aliases emits `axisTendency: dependent`;
- a key mapped by both X and Y aliases emits `axisTendency: unknown`, unless an
  explicit trailing axis marker such as `X` or `Y` selects one side;
- a title token that has no configured key match emits no semantic title
  evidence.

This keeps token capture separate from semantic judgement. DataResource owns
the token-to-key lookup and ambiguity evidence. Review consumes the resulting
title spans, X ranges/groups, data blocks, bindings, and fingerprints; Review
must not reinterpret raw title tokens or create aliases to make a candidate
fit.

Rules should cover common aliases as X/Y evidence, not as physical role
judgements:

```txt
Vg / Vgs / Gate Voltage
  -> rule evidence: axisTendency x, type transfer

Vd / Vds / Drain Voltage
  -> rule evidence: axisTendency x, type output

Id / Ids / Drain Current
  -> rule evidence: axisTendency dependent

time / frequency / bias
  -> rule evidence from matching transient / frequency / generic rules

Cgg / capacitance
  -> rule evidence: axisTendency dependent
```

The title span is bounded by the continuous numeric run below the title. It
should stop at:

- an empty row;
- a clear non-numeric block;
- the next title/info row;
- a repeated-block boundary;
- a column-structure break.

Title evidence can strongly identify whether a column is usable as X or Y for a
matched rule, but it should not create a slice range without a numeric run. The
final row start / row end still comes from the selected XRangeCandidate.

### X Range Scoring

Positive evidence:

- high numeric coverage;
- low empty-cell density;
- monotonic direction;
- low variance in adjacent deltas;
- segmented constant-step behavior;
- repeated pattern across blocks or adjacent pair columns;
- header hints such as `Vg`, `Vd`, `time`, `frequency`, or `bias`;
- title/info cell above the same column matches a rule X term;
- row alignment with nearby dependent value candidates.

Negative evidence:

- too few points;
- values exactly match physical row numbers or sample index patterns;
- column looks like metadata, id, group, or label data;
- sequence is constant;
- sequence has no plausible aligned dependent value column.

Important boundary: a Y column can also be monotonic or nearly linear. Fixed
step alone should not force a final X decision.

### X Groups / Lines

If X has clear monotonicity, slicing has a reliable anchor. XRangeCandidate
should determine more than the row range; it should also derive segmentation,
group, and line candidates.

```txt
one monotonic X run
  -> one slice row range
  -> one group
  -> one line

multiple monotonic X runs
  -> multiple groups
  -> multiple lines
```

Group boundaries should come from X, not Y:

- X direction reverses, such as ascending to descending;
- X resets to the start or near the start;
- X pattern repeats;
- a repeated block introduces a new X run;
- pairwise X/Y data binds each X run to its own dependent value column.

Therefore X groups become lines. Dependent values follow the selected X group
for reading and do not decide group boundaries.

Implementations must tolerate floating-point error and points-derived steps,
such as approximate `0.3333333` spacing. Hysteresis / forward-backward sweeps
must not be treated as bad data; they should be split into multiple monotonic X
groups.

### DataBlock / DataRegion Candidates

After a high-confidence X is found, the algorithm should build data block /
data region candidates around that X. The key rule is that X determines the row
span, and only neighboring data columns within the same row span are eligible
to become dependent values.

The common pattern is that dependent values are in neighboring columns to the
right of X. Left-side dependent values are not impossible, but they are rare;
they should receive lower priority or be left for Review to decide whether user
confirmation is needed.

Basic flow:

```txt
high-confidence X range
  -> use X row span as block row range
  -> scan adjacent numeric columns, right side first
  -> collect dependent value columns
  -> treat blank / non-data columns as block separators
  -> emit DataBlockCandidate
```

These shapes should all be unified as data blocks instead of being classified
by layout name first:

```txt
X Y
X Y Y Y Y
X Y Y | X Y Y | X Y Y
X Y _ _ X Y _ _ X Y
X Y Y Y Y _ X Y Y Y
```

Blank columns are usually strong separators and can split `X Y _ _ X Y` into
multiple blocks. They should not always be hard breaks: malformed exports may
include missing columns. Treat blanks as strong boundary evidence and preserve
diagnostics / reasons.

DataBlockCandidate describes the readable column block around X, not the final
layout taxonomy. Review can later interpret it as `oneX-oneY`, `oneX-manyY`,
`manyXYpairs`, or repeated blocks.

### Dependent Value Candidates

The slice row range, row start / row end, and segmentation should be determined
by XRangeCandidate values. Y does not decide where to slice.

Therefore this should not be modeled as an independent `YRangeCandidate`. A
more accurate name is `DependentValueCandidate`: a column that can be read as
dependent values inside the row span of an X range.

The curve shape of Y should not be a strong confidence source. In most
measurement files, Y columns are currents, capacitances, conductances, or
derived values; they may be nonlinear, noisy, locally monotonic, nearly linear,
sign-changing, or flat over part of the range.

Therefore dependent-value detection should be mostly permissive. It should use
shape only to reject clearly invalid columns, not to prove that a column is Y.
A non-fixed-step or non-monotonic sequence is not enough to make a column Y,
and a monotonic or nearly linear sequence is not enough to reject it as Y.

The confidence here means whether the column can be read as dependent values
within an X range. It does not mean the column can help decide the slice range.

Positive evidence:

- row span is determined by the bound X range;
- column is inside a DataBlockCandidate;
- numeric coverage is high;
- column is adjacent to an X range or follows a shared X;
- header hints match rule Y terms such as current or capacitance aliases;
- title/info cell above the same column shares a rule with the bound X term;
- values are not merely row indexes or repeated sweep parameters.

### Binding Generation

Bindings should be generated after XRangeCandidate and DependentValueCandidate
values exist.

Examples:

```txt
X Y
  -> oneX-oneY

X Y Y Y Y
  -> oneX-manyY

X Y X Y X Y
  -> manyXYpairs

block: X Y
block: X Y
  -> segmentedSweep or repeated blocks
```

If multiple X columns are identical, that should not reduce confidence that
they are X ranges. The ambiguity belongs to binding selection: Review must
decide whether the data should be treated as repeated pairwise X/value bindings
or as one shared X range with many dependent value columns.

## Review Evaluation

Review should consume the evidence and decide:

- which binding candidate best matches the file;
- whether the candidate is distinct enough to recommend automatically;
- whether ambiguity requires user confirmation;
- which executable `Template` should be produced.

Review can use:

- binding confidence from `DataResource`;
- rule evidence, type, and axis tendency from ColumnTitleSpanEvidence;
- semantic rules fingerprint / evidence fingerprint;
- parser diagnostics;
- ambiguity codes;
- user templates or confirmed schema profiles;
- stale/source-version checks.

Review should not rescan raw rows or rebuild numeric-run evidence.

## Template Output

The final template should store executable selection rules, not the algorithm's
internal layout taxonomy.

The important output facts are:

- X columns and X ranges;
- dependent / Y columns;
- row range;
- segmentation;
- measurement binding;
- applicability fingerprint.

`xy`, `xyyyy`, and `xyxyxy` can remain useful only as debug labels or
post-hoc explanations, but the template execution path should be driven by
explicit X ranges, data blocks, and axis bindings. The read range for Y comes
from the bound X range; Y should not decide the slice range independently.

## Edge Cases

- A Y column may be nearly linear and monotonic.
- A row index or sample-number column may look like fixed-step X.
- A file may contain multiple segmented sweeps in one column.
- Pairwise files may contain many independent X columns.
- X may be a log / ratio sweep where adjacent deltas are unstable but adjacent
  ratios are stable.
- Wide matrix data may encode X in metadata or column labels, not in a physical
  data column.
- Horizontal or transposed data may put X in a row rather than a column. This is
  mostly an axis-flipped version of the vertical rules and should be handled as
  matrix / transposed evidence.
- Numeric values may include units as text, such as `1 V` or `2mA`, and require
  numeric-with-unit normalization. This is usually uncommon and should remain a
  marked risk until that normalization exists.
- One sheet may contain multiple separated data table blocks, each of which
  should produce candidates independently.
- First-row-header files may have no metadata block at all.
- Headerless numeric files may start directly at row 0 with no names, units, or
  metadata references.
- B1500-style files may have hundreds of metadata rows before `DataName` and
  `DataValue` rows.
- Title/info rows may use a row marker plus per-column titles, such as
  `DataName,Vg,Id,...`, rather than a simple one-cell header.
- Files with mixed text/numeric cells, no meaningful row marker, no title/info
  evidence, and no X pattern should be marked dirty / ambiguous instead of
  being automatically recommended.
- A file extension may be wrong, for example binary XLSX content saved with a
  `.csv` suffix. That is a parser/input problem, not a Review scoring problem.

## Additional Shapes

The primary path covers column-oriented curve data. These shapes need extra
evidence or a downgrade strategy:

- **Transposed / horizontal sweep**: X is laid out across a row and Y may appear
  in rows below it. This is mostly an axis-flipped version of vertical curve
  detection. It should use matrix/transposed evidence rather than mixing into
  the column-first primary path.
- **Log sweep / ratio sweep**: X is not constant-delta, but adjacent ratios are
  stable. This should be another high-confidence X pattern.
- **Multi-level title / unit rows**: title, unit, and condition rows may be
  separate. Title-span matching may combine them, while data start still comes
  from the numeric run.
- **Embedded unit numeric text**: cells may look textual but be numeric in
  meaning, such as `-1 V` or `10 kHz`. This is usually uncommon; keep it marked
  as a risk until numeric-with-unit normalization is implemented.
- **Multiple tables in one sheet**: separated data blocks in the same sheet
  should not be merged under the first X block.
- **Left-side dependent values**: rare but possible. Right-side preference is a
  strong prior, not an absolute ban; left-side hits should lower confidence or
  let Review handle ambiguity.

## Test Strategy

The algorithm should be tested against at least these shapes:

- first-row `X,Y` table;
- first-row `X,Y,Y,Y` table;
- first-row `X,Y,X,Y` pairwise table;
- headerless numeric-only `X,Y` data starting at row 0;
- headerless numeric-only `X,Y,Y,Y` and `X,Y,X,Y` data starting at row 0;
- long metadata block followed by a `DataName` row and numeric `DataValue`
  rows;
- segmented sweeps where each segment has fixed step but the full column is not
  globally fixed step;
- X direction reversals that create multiple monotonic groups / lines;
- X resets that create a new group / line;
- hysteresis / forward-backward sweeps split into multiple X groups;
- log / ratio sweep X patterns;
- irregular X steps where the title/info row matches `Vg`, `Vd`, `time`, or
  `frequency`;
- row-marker plus per-column title forms such as `DataName,Vg,Id,...`;
- column-first segmentation where the first column is a `DataValue` marker and
  later columns are numeric data;
- block separators such as `X Y Y | X Y Y`, `X Y _ _ X Y`, and
  `X Y Y Y _ X Y Y`;
- rare left-side dependent values;
- transposed / horizontal sweeps that require matrix evidence;
- dirty data where both marker evidence and X pattern are missing;
- columns that look like row indexes;
- monotonic Y values that should not outrank a stronger X candidate;
- Y curve shape must not move the slice row start or row end;
- malformed or misclassified input files.

Each test should assert both the candidates and the final Review decision. This
keeps `DataResource` responsible for evidence and `Review` responsible for
evaluation.
