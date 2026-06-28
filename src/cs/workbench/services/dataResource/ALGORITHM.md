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
  -> detect DependentValueCandidate values
  -> generate BindingCandidate values
  -> expose structured evidence with confidence and reasons

Recipe
  -> describe passive expectations over structured evidence

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
  readonly stepKind: "constant" | "nearlyConstant" | "pointsDerived" | "segmentedConstant";
  readonly step?: number;
  readonly pointCount: number;
  readonly confidence: number;
  readonly reasons: readonly string[];
};
```

```ts
type DependentValueCandidate = {
  readonly column: number;
  readonly xRangeCandidateIds: readonly string[];
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
  readonly canonicalRole: "vg" | "vd" | "id" | "time" | "frequency" | "capacitance" | string;
  readonly canonicalUnit?: "V" | "A" | "s" | "Hz" | "F" | string;
  readonly axisTendency: "x" | "dependent" | "unknown";
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
  -> find continuous numeric runs
  -> match nearby column title spans through the title library
  -> group compatible runs into data regions
  -> score XRangeCandidate values
  -> collect DependentValueCandidate values inside X ranges
  -> generate BindingCandidate values
  -> expose structured evidence
  -> Review evaluates evidence and materializes Template
```

### Numeric Runs

The first pass should scan by column and row to find continuous numeric runs.
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
  -> normalize title
  -> lookup canonical title library
  -> emit ColumnTitleSpanEvidence
```

The title library should cover common aliases:

```txt
Vg / Vgs / Gate Voltage
  -> role: vg, unit: V, axisTendency: x

Vd / Vds / Drain Voltage
  -> role: vd, unit: V, axisTendency: x

Id / Ids / Drain Current
  -> role: id, unit: A, axisTendency: dependent

time / frequency / bias
  -> role: time/frequency/voltage, axisTendency: x

Cgg / capacitance
  -> role: capacitance, unit: F, axisTendency: dependent
```

The title span is bounded by the continuous numeric run below the title. It
should stop at:

- an empty row;
- a clear non-numeric block;
- the next title/info row;
- a repeated-block boundary;
- a column-structure break.

Title evidence can strongly identify the column's data type, but it should not
create a slice range without a numeric run. The final row start / row end still
comes from the selected XRangeCandidate.

### X Range Scoring

Positive evidence:

- high numeric coverage;
- low empty-cell density;
- monotonic direction;
- low variance in adjacent deltas;
- segmented constant-step behavior;
- repeated pattern across blocks or adjacent pair columns;
- header or unit hints such as `Vg`, `Vd`, `time`, `frequency`, or `bias`;
- title/info cell above the same column matches an X-like canonical role;
- row alignment with nearby dependent value candidates.

Negative evidence:

- too few points;
- values exactly match physical row numbers or sample index patterns;
- column looks like metadata, id, group, or label data;
- sequence is constant;
- sequence has no plausible aligned dependent value column.

Important boundary: a Y column can also be monotonic or nearly linear. Fixed
step alone should not force a final X decision.

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
- numeric coverage is high;
- column is adjacent to an X range or follows a shared X;
- header or unit hints match measurement values such as current or capacitance;
- title/info cell above the same column matches a dependent-like canonical role;
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
- role / unit / axis tendency from ColumnTitleSpanEvidence;
- recipe expectations;
- semantic roles and units;
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

`xy`, `xyyyy`, and `xyxyxy` can remain useful as Review or Recipe vocabulary,
but the template execution path should be driven by explicit X ranges and axis
bindings. The read range for Y comes from the bound X range; Y should not decide
the slice range independently.

## Edge Cases

- A Y column may be nearly linear and monotonic.
- A row index or sample-number column may look like fixed-step X.
- A file may contain multiple segmented sweeps in one column.
- Pairwise files may contain many independent X columns.
- Wide matrix data may encode X in metadata or column labels, not in a physical
  data column.
- First-row-header files may have no metadata block at all.
- Headerless numeric files may start directly at row 0 with no names, units, or
  metadata references.
- Origin-style files may have hundreds of metadata rows before `DataName` and
  `DataValue` rows.
- Title/info rows may use a row marker plus per-column titles, such as
  `DataName,Vg,Id,...`, rather than a simple one-cell header.
- A file extension may be wrong, for example binary XLSX content saved with a
  `.csv` suffix. That is a parser/input problem, not a Review scoring problem.

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
- irregular X steps where the title/info row matches `Vg`, `Vd`, `time`, or
  `frequency`;
- row-marker plus per-column title forms such as `DataName,Vg,Id,...`;
- columns that look like row indexes;
- monotonic Y values that should not outrank a stronger X candidate;
- Y curve shape must not move the slice row start or row end;
- malformed or misclassified input files.

Each test should assert both the candidates and the final Review decision. This
keeps `DataResource` responsible for evidence and `Review` responsible for
evaluation.
