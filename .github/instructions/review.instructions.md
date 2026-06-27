---
description: Review service - URI-grounded content segment candidate derivation/evaluation, selected ReviewedTemplate snapshots, manual adjustment state, and system-application recommendations.
applyTo: 'src/cs/workbench/services/review/**,src/cs/workbench/contrib/review/**'
---
# Review

Review is the owner of evaluator-gated candidate/segment retention decisions
for URI-backed content versions. The public association is always
URI-grounded: `resource URI + contentHash/sourceVersion + optional selector or
sheet sub-target`. Do not introduce a public `result target`. Internal caches
may derive private keys from that association, but public APIs stay URI-based.

The primary content path is CanonicalContentMatrix + Recipe/UserTemplate ->
SegmentCandidate -> evaluator -> accepted Segment. The current table analysis
surface is only one projection of URI content; Review maps accepted table-shaped
candidates to `ReviewCandidate` / `ReviewResult` / `ReviewedTemplate` -> Slice
at the adapter edge. Review is the first layer that may choose retention,
template usability for the current table adapter, or system application.

## Ownership

`IReviewService` owns:

- building `SegmentCandidate` values from canonical URI/content evidence and
  Recipe/UserTemplate snapshots; table projections are represented by
  `SegmentCandidate`/`ReviewCandidate` values only at the current adapter edge;
- evaluating candidates into `accepted`, `needsAdjustment`, or `invalid`
  decisions, with current table-projection states expressed as `ready`,
  `needsAdjustment`, or `invalid`;
- selecting the `ReviewedTemplate` snapshot when a current table-projection
  candidate is ready for Slice;
- deciding `systemRecommended` versus `userActionRequired`;
- returning structured manual-template review results;
- exposing cache-only latest full review results for Review/Slice-level
  consumers through `getLatestReview({ resource, contentHash?, sheetId? })`;
- maintaining URI-backed latest review summaries associated with
  `resource + contentHash/sourceVersion + sheetId` for Explorer decorations and
  hover;

It does not own raw row profiling, Recipe catalog storage, UserTemplate catalog
CRUD, canonical Template spec/editor state, Slice planning/execution, Explorer UI
projection, or Template editor view state.

## Flow

URI-backed review pipeline:

```txt
URI + contentHash/sourceVersion
  -> canonical content evidence
  -> ReviewEvidence(sourceMetadata + projection evidence)
  -> Recipe/UserTemplate snapshots
  -> SegmentCandidate / ReviewCandidate values
  -> evaluator policy
  -> ReviewResult / ReviewSummary / accepted Segment
```

Current table-projection source:

```txt
Explorer decoration / hover
  -> IReviewService.getLatestReviewSummary({ resource, contentHash?, sheetId? })
  -> ITableModelService.createModelReference(resource, source)
  -> TableModelSnapshot content + parser diagnostics + source/model version/content hash when available
  -> ReviewEvidence.tableProjection
  -> ReviewService builds SegmentCandidate / ReviewCandidate values
  -> ReviewService scores candidates within evaluator policy
  -> Review service-local summary cache keyed by private URI association key
  -> reviewChanged
  -> Explorer rereads latest Review summary
```

This summary cache is service-local. It is invalidated by source/content
version changes, Recipe changes, and UserTemplate
changes. Explorer must not fall back to Session raw-table records for
URI-backed semantic decorations.

User commands or explicit URI-backed execution controllers read the current URI
review result and submit URI-backed slice requests, with idempotency and
staleness guards based on contentHash/sourceVersion, model version, and review
signatures.

Manual execution:

```txt
user command / UserTemplate picker / inline template editor
  -> IReviewService.reviewUri({ resource, contentHash?, sheetId? })
  -> IReviewService.reviewUriManualTemplate(...)
  -> ManualTemplateReviewResult
  -> ready result only
  -> SliceUriRequest(trigger = userCommand)
  -> ISliceService.submitUri(...)
```

## Core Files

| File | Responsibility |
| --- | --- |
| `common/review.ts` | service contract, URI manual review request/result types, and content-versioned review evidence signatures. |
| `common/reviewModel.ts` | pure `ReviewContext`, `SegmentCandidate`/`ReviewCandidate`, `ReviewResult`, `ReviewDecision`, factors, findings, `ReviewedTemplate`, and summary types. |
| `common/reviewEvidence.ts` | URI/content evidence shape used by Review candidate building; current table-derived fields live under optional `tableProjection` as one content projection. |
| `common/reviewSelector.ts` | pure Recipe dataRange/blockPartition/physicalLayout/logicalRelation matching against Review evidence. |
| `common/reviewCandidate.ts` | pure Recipe/UserTemplate candidate derivation from Review evidence. |
| `common/reviewScoring.ts` | pure ReviewCandidate scoring into `CandidateReview` factors/findings/status. |
| `common/reviewResult.ts` | pure ReviewResult assembly from review context, candidates, scoring, and decision policy. |
| `browser/reviewService.ts` | injectable owner that reads URI-backed table model snapshots, runs pure review helpers, and maintains latest review summaries. |

Review candidate helpers live under `services/review/common` and produce
`SegmentCandidate` / `ReviewCandidate` values before Review status/policy projection.
User-template candidates come through `IUserTemplateService` and
`UserTemplateSnapshot`. Decision logic and candidate derivation logic belong in
Review, not Template, TableModel, Explorer, or Slice. Manual callers use
`reviewUriManualTemplate(...)` with a URI-backed content target.

## Rules

- Review API targets use URI plus optional content version and content
  sub-targets. Do not expose `result target`, synthetic cache keys, or keyed map
  fields as public contracts.
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
  resource, optional sheetId, optional contentHash, model/source versions,
  evidence fingerprint, and evidence projected from the canonical content matrix.
  Candidate building and scoring must consume this context, not raw rows or
  Template service state.
- `ReviewFinding` is the Review-owned explanation surface. Parser
  diagnostics may influence parseHealth and hard gates, but they are not the
  same type or owner as Review findings.
- Blocking Review findings, including parser-diagnostic hard gates projected
  from URI-backed table snapshots, must produce an `invalid`
  `ReviewDecision` rather than a manual-adjustment state.
- `ReviewedTemplate.source` describes template provenance only: Recipe,
  UserTemplate, or inline. It must not encode manual, auto, saved-selection
  compatibility, user command, or system trigger.
- Accepted table measurement semantics belong on the reviewed executable
  `Template` snapshot (`ReviewedTemplate.template.measurement`), not on
  `UriReview`, `ReviewSummary`, or Slice request bridge fields.
- Execution trigger belongs to `SliceRequest.trigger`.
- Non-selected candidate records store summaries only. Detail rebuilding must
  verify Recipe/UserTemplate fingerprints and return a stale result when
  snapshots no longer match.
- Review evidence signatures include URI-backed source identity,
  `contentHash` when available, and `sourceVersion` / `modelVersion` when
  present, so reviewed facts can go stale on content changes, editor-model
  changes, or projection/source version changes.
- Bump `reviewPolicyVersion` whenever thresholds, conflict rules, critical
  diagnostic handling, override rules, or source priority changes.
- Explorer reads Review summaries and Slice state as projection inputs; it does
  not perform Review policy checks.
- Manual Review requests may accept `userTemplate` selections; lookup must go
  through `IUserTemplateService` and the resulting `ReviewedTemplate.source`
  must be `userTemplate`.

## Do Not

- Do not call Slice from `ReviewService`; use an explicit user-command or
  URI-backed execution controller that submits `SliceRequest` values.
- Do not introduce or expose a review `result target`; review results are
  derived facts associated with a URI content version.
- Do not read raw rows, rerun table-model detection, or delegate candidate
  derivation to Template.
- Do not store user template catalog data in Review records.
- Do not let Template, TableModel producers, Slice, or Explorer decide
  `systemRecommended`.
