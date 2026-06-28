---
description: Review service - URI-grounded content candidate derivation/evaluation, selected ReviewedTemplate snapshots, manual adjustment state, and system-application recommendations.
applyTo: 'src/cs/workbench/services/review/**,src/cs/workbench/contrib/review/**'
---
# Review

Review owns evaluator-gated candidate and segment retention decisions for
URI-backed content versions. The public association is always URI-grounded:
`resource URI + contentHash/sourceVersion + optional selector or sheet
sub-target`. Do not introduce a public result target. Internal caches may derive
private keys from that association, but public APIs stay URI-based.

Review does not review Table UI and is not downstream of `ITableService`,
`TableWidget`, `TableViewModel`, row caches, preview projections, or Explorer
presentation. Current tabular support is a structured/matrix evidence adapter
for URI content. It may use `sheetId` as a content sub-target and an optional
materialization version as a stale input, but it must not expose table UI
projection as Review API.

The primary content path is:

```txt
URI + contentHash/sourceVersion
  -> structured content snapshot / CanonicalContentMatrix
  -> ReviewEvidence(sourceMetadata + structured/matrix evidence)
  -> Recipe/UserTemplate/built-in template snapshots
  -> SegmentCandidate / ReviewCandidate values
  -> evaluator policy
  -> ReviewResult / ReviewSummary / accepted Segment
```

When a current tabular/structured adapter needs executable output, Review maps
the selected candidate to a `ReviewedTemplate` for Slice. Review is the first
layer that may choose retention, template usability for the current adapter, or
system application.

## Ownership

`IReviewService` owns:

- building `SegmentCandidate` / `ReviewCandidate` values from URI content
  evidence and Recipe/UserTemplate/built-in template snapshots;
- evaluating candidates into `accepted`, `needsAdjustment`, or `invalid`
  decisions, with current adapter states expressed as `ready`,
  `needsAdjustment`, or `invalid`;
- selecting the `ReviewedTemplate` snapshot when a candidate is ready for Slice;
- deciding `systemRecommended` versus `userActionRequired`;
- returning structured manual-template review results;
- exposing URI execution projections for Slice-level consumers through
  `reviewUriForExecution({ resource, contentHash?, sheetId? })`;
- maintaining URI-backed latest review summaries associated with
  `resource + contentHash/sourceVersion + optional sheetId` for Explorer
  decorations and hover.

It does not own source fetch, parser implementation, raw row profiling, Table UI
state, table model lifecycle, Recipe catalog storage, UserTemplate catalog CRUD,
canonical Template spec/editor state, Slice planning/execution, Explorer
decoration mapping, or Template editor view state.

## Flow

URI-backed review pipeline:

```txt
URI + contentHash/sourceVersion
  -> IDataResourceService.resolveStructuredContent(...)
  -> structured content snapshot / CanonicalContentMatrix
  -> ReviewEvidence(sourceMetadata + structured/matrix evidence)
  -> Recipe/UserTemplate/built-in template snapshots
  -> SegmentCandidate / ReviewCandidate values
  -> evaluator policy
  -> ReviewResult / ReviewSummary / accepted Segment
```

Review Algorithm Sequence:

```txt
URI + contentHash/sourceVersion + optional sheetId
  -> DataResourceService infers structured evidence
     (rows/cells/blocks + diagnostics + profiles + evidence fingerprint)
  -> measurement projection resolves explicit roles first
     (vg -> transfer, vd -> output, generic voltage -> unknown)
  -> ReviewService reads structured content snapshot
  -> ReviewService builds SegmentCandidate / ReviewCandidate values
  -> ReviewService scores candidates within evaluator policy
  -> ReviewDecision selects ReviewedTemplate when the candidate is ready
  -> ReviewDecision returns invalid/noCandidates when the evidence is ambiguous
  -> Slice stays on the user-template path until Review produces a usable template
```
```mermaid
sequenceDiagram
  participant Caller as URI-backed caller / Slice Command
  participant Data as DataResourceService
  participant Review as ReviewService
  participant Recipe as RecipeSnapshot
  participant Selector as reviewSelector
  participant Candidate as reviewCandidate
  participant Decision as reviewDecision

  Caller->>Review: reviewUriForExecution(resource, sheetId?)
  alt current cached review
    Review-->>Caller: cached ready OR invalid/noCandidates OR null pending/error
  else active URI review is resolving
    Review->>Review: await existing URI review promise
    Review-->>Caller: ready reviewedTemplate OR invalid/noCandidates OR null
  else missing or stale review
    Review->>Data: resolveStructuredContent(resource, sheetId)
    Note over Data: Current implementation may materialize through TableModelService as a private bridge
    Data->>Data: header/data range/column role inference
    Data->>Data: measurement projection
    Note over Data: Vg=>transfer, Vd=>output, generic Voltage=>unknown
    Review->>Recipe: read passive recipes
    Review->>Selector: match recipe domain/layout/roles
    Selector->>Candidate: matched blocks/captures
    Candidate->>Decision: candidate templates
    Decision->>Decision: score + ambiguity + freshness + diagnostics
    Decision-->>Review: ready reviewedTemplate OR invalid/noCandidates
    Review-->>Caller: ready reviewedTemplate OR invalid/noCandidates
  end
  Caller->>Caller: use reviewedTemplate, or require user template
```


Explorer decoration and hover consume only Review's public summary:

```txt
ReviewService onDidChangeReview
  -> ExplorerDecorationsProvider.provideDecorations(resource)
  -> IReviewService.getLatestReviewSummary({ resource, contentHash?, sheetId? })
  -> ReviewService returns cached/stale/active-pending/missing summary without resolving content
  -> ReviewSummary(state, confidence, reviewedSemanticLabel, message, signatures)
  -> IDecorationsService / Explorer hover presentation
```

Explorer decoration does not subscribe to or read `ReviewEvidence`. A semantic
label such as a curve kind, family, or role comes from `ReviewSummary` /
`ReviewedTemplate` metadata after Review has made a decision.

This summary cache is service-local. It is invalidated by content version
changes, evidence fingerprint changes, Recipe changes, UserTemplate changes,
review policy changes, and optional materialization-version changes. Explorer
must not fall back to Session raw-table records for URI-backed semantic
decorations.

Missing or stale URI summaries are not refreshed by Explorer decoration reads.
Explorer may receive a missing, stale, or active-pending summary and must keep
rendering without forcing synchronous or background structured-content
resolution. Explicit execution paths such as `reviewUriForExecution(...)` may
resolve structured content, cache the resulting summary, and publish the later
`onDidChangeReview` update.

User commands or explicit URI-backed execution controllers read the current URI
review execution projection and submit URI-backed Slice requests, with idempotency and
staleness guards based on contentHash/sourceVersion, evidence fingerprint,
optional materialization version, review signature, and template fingerprint.

Manual execution:

```txt
user command / UserTemplate picker
  -> IReviewService.reviewUriForExecution({ resource, contentHash?, sheetId? })
  -> IReviewService.reviewUriManualTemplate(user template id)
  -> ManualTemplateReviewResult
  -> ready result only
  -> IReviewService.confirmReviewedTemplate(...) for explicit user-confirmed templates
  -> SchemaProfileService.confirmProfile(...) when structured-content bindings can be derived
  -> SliceUriRequest(trigger = userCommand)
  -> ISliceService.submitUri(...)
```

## Core Files

| File | Owns | Must not own |
| --- | --- | --- |
| `common/review.ts` | `IReviewService` contract, URI execution/manual review request and result types, review/evidence/result signature helpers. | Evidence shape definitions, browser cache implementation, Explorer decoration mapping, Slice submission. |
| `common/reviewModel.ts` | Pure Review domain model: Review input evidence wrapper, `ReviewContext`, `SegmentCandidate`, `ReviewCandidate`, `ReviewResult`, `ReviewDecision`, factors, findings, `ReviewedTemplate`, `ReviewSummary`. | Service implementation, evidence production, Recipe catalog storage, Explorer UI types, structured-content adapter types. |
| `common/reviewSelector.ts` | Pure Recipe dataRange/blockPartition/physicalLayout/logicalRelation matching against URI/content evidence. | File reads, parser logic, candidate scoring, Template materialization. |
| `common/reviewCandidate.ts` | Pure Recipe/UserTemplate/built-in template snapshot + URI/content evidence -> `SegmentCandidate` / `ReviewCandidate` derivation. | Final Review status, `ReviewedTemplate` selection, Slice execution, Explorer decoration. |
| `common/reviewDecision.ts` | Pure assembly of context, candidates, scoring, and decision policy into `ReviewResult`, selected `ReviewedTemplate`, and summary-ready facts. This is one decision pipeline, not separate scoring/result owners. | Candidate derivation, browser scheduling/cache, file/model reads, Explorer decoration mapping, Slice execution. |
| `browser/reviewService.ts` | Injectable service owner for cache, stale checks, scheduling/background review, manual review entry points, and consuming `IDataResourceService` structured-content snapshots. | Table UI parsing, table projection ownership, data-resource resolution, DOM/UI decoration, Explorer tree state, Slice execution. |

Review candidate helpers live under `services/review/common` and produce
`SegmentCandidate` / `ReviewCandidate` values before Review status/policy
projection. These helpers are pure review pipeline modules, not independent
services; `browser/reviewService.ts` remains the single service owner that
orchestrates the complete Review workflow. User-template candidates come
through `IUserTemplateService` and `UserTemplateSnapshot`. Built-in recipes or
built-in template snapshots are candidate inputs, not pre-reviewed results.
Decision logic and candidate derivation logic belong in Review, not Template,
Table UI/model, Explorer, or Slice.

Review consumes structured-content facts from `IDataResourceService`. The
`ReviewEvidence` wrapper stays in `reviewModel.ts` because it adds Review-owned
source metadata and signature input around the shared structured-content
snapshot. Do not reintroduce Review-local structured-content bridges.

## Rules

- Review API targets use URI plus optional content version and content
  sub-targets. Do not expose `result target`, synthetic cache keys, or keyed map
  fields as public contracts.
- Public Review target interfaces may accept nullable optional fields at the
  service boundary. `ReviewService` must normalize them once into a private
  target interface with optional concrete fields before cache, scheduling,
  data-resource, or execution helper code consumes them.
- `ReviewEvidence` names content facts as structured/matrix evidence. Do not
  introduce table UI projection target APIs or import Table UI/model types into
  evidence definitions.
- `ReviewDecision` is the only source for template usability and system
  application recommendations.
- System recommendation policy is Review-owned: it uses `CandidateReview`
  confidence, factors, findings, and Review policy.
- `SegmentCandidate`/`ReviewCandidate` is Review-owned pipeline data. It may
  carry candidate confidence, provider rank, reasons, diagnostics, optional
  captures, source selectors, `contentHash`, a review-owned executable
  interpretation, and the candidate interpretation fingerprint, but it must not
  carry final `accepted` / `ready` / `needsAdjustment` / `invalid` status, a
  template fingerprint, or the final `Template` snapshot. Review creates that
  snapshot only when a candidate is selected as `ReviewedTemplate`.
- `ReviewContext` is the Review input model for URI-backed content targets:
  resource, optional sheetId, optional contentHash/sourceVersion,
  evidenceFingerprint, optional materializationVersion, and evidence projected
  from the canonical content matrix. Candidate building and scoring consume this
  context, not raw rows or Template service state.
- `ReviewFinding` is the Review-owned explanation surface. Parser diagnostics
  may influence parseHealth and hard gates, but they are not the same type or
  owner as Review findings.
- Blocking Review findings, including parser-diagnostic hard gates projected
  from structured content evidence, must produce an `invalid` `ReviewDecision`
  rather than a manual-adjustment state.
- `ReviewedTemplate.source` describes template provenance only: `builtin` or
  `user`. It must not encode manual, auto, saved-selection compatibility,
  force-review override, user command, or system trigger.
- Accepted measurement semantics belong on the reviewed executable `Template`
  snapshot (`ReviewedTemplate.template.measurement`), not as standalone fields
  on `UriReviewExecution`, `ReviewSummary`, or Slice request bridge fields.
- Execution trigger belongs to `SliceUriRequest.trigger`.
- Non-selected candidate records store summaries only. Detail rebuilding must
  verify Recipe/UserTemplate fingerprints and return a stale result when
  snapshots no longer match.
- Review signatures include URI-backed source identity, `contentHash` when
  available, `sourceVersion`, `evidenceFingerprint`, and optional
  `materializationVersion`, so reviewed facts can go stale on content,
  evidence, adapter, or policy changes.
- Schema profile evidence may use exact fingerprint matches for automatic
  recommendation when bindings are complete. Similar schema matches are
  Review-only manual-assist signals and must not unlock
  `systemRecommended`.
- Bump `reviewPolicyVersion` whenever thresholds, conflict rules, critical
  diagnostic handling, override rules, or source priority changes.
- Explorer reads Review summaries and Slice state as projection inputs; it does
  not read evidence or perform Review policy checks.
- Manual Review requests accept saved user-template selections only; lookup
  must go through `IUserTemplateService` and the resulting
  `ReviewedTemplate.source` must be `user`.

## Do Not

- Do not call Slice from `ReviewService`; use an explicit user-command or
  URI-backed execution controller that submits `SliceUriRequest` values.
- Do not introduce or expose a review `result target`; review results are
  derived facts associated with a URI content version.
- Do not read raw rows, rerun table-model detection, or delegate candidate
  derivation to Template.
- Do not store user template catalog data in Review records.
- Do not let Template, Table UI/model producers, Slice, or Explorer decide
  `systemRecommended`.
- Do not let Explorer decorations, hover, labels, or badge rendering read
  `ReviewEvidence`; they consume `ReviewSummary` only.
