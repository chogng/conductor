---
description: Review service - TableReviewCandidate derivation/review, selected ReviewedTemplate snapshots, manual adjustment state, and system-application recommendations.
applyTo: 'src/cs/workbench/services/review/**,src/cs/workbench/contrib/review/**'
---
# Review

Review is the owner of Template usability and application decisions for
URI-backed table resources. It builds `TableReviewCandidate` values from table
evidence plus Recipe/UserTemplate snapshots and keeps latest review results
keyed by `resource + sheetId`.

The primary template path is TableModel + Recipe/UserTemplate ->
TableReviewCandidate -> TableReviewResult / ReviewedTemplate -> Slice. Review
is the first layer that may choose usability or system application.

## Ownership

`IReviewService` owns:

- building `TableReviewCandidate` values from table evidence and
  Recipe/UserTemplate snapshots;
- reviewing candidates into `ready`, `needsAdjustment`, or `invalid`;
- selecting the `ReviewedTemplate` snapshot when a candidate is ready;
- deciding `systemRecommended` versus `userActionRequired`;
- returning structured manual-template review results;
- exposing cache-only latest full table review results for Review/Slice-level
  consumers through `getLatestReview({ resource, sheetId })`;
- maintaining URI-backed latest review summaries keyed by `resource + sheetId`
  for Explorer decorations and hover;

It does not own raw row profiling, Recipe catalog storage, UserTemplate catalog
CRUD, canonical Template spec/editor state, Slice planning/execution, Explorer UI
projection, or Template editor view state.

## Flow

URI-backed Explorer summary:

```txt
Explorer decoration / hover
  -> IReviewService.getLatestReviewSummary({ resource, sheetId })
  -> ITableModelService.createModelReference(resource, source)
  -> TableModelSnapshot content + parser diagnostics + source/model version
  -> ITableModelProducerService.getOrCreate(...)
  -> ReviewService builds TableReviewCandidate values
  -> ReviewService scores candidates
  -> Review service-local summary cache keyed by resource + sheetId
  -> reviewChanged
  -> Explorer rereads latest Review summary
```

This summary cache is service-local. It is invalidated by URI-backed table
model changes, Recipe changes, and UserTemplate changes. Explorer must not fall
back to Session raw-table records for URI-backed semantic decorations.

Automatic execution from Review is not wired through a Session review bridge.
User commands or explicit URI-backed execution controllers read the current
`resource + sheetId` review result and submit URI-backed slice requests, with
idempotency and staleness guards based on model/source versions and review
signatures.

Manual execution:

```txt
user command / UserTemplate picker / inline template editor
  -> IReviewService.reviewUriTable({ resource, sheetId })
  -> IReviewService.reviewUriManualTemplate(...)
  -> ManualTemplateReviewResult
  -> ready result only
  -> SliceUriRequest(trigger = userCommand)
  -> ISliceService.submitUri(...)
```

## Core Files

| File | Responsibility |
| --- | --- |
| `common/review.ts` | service contract, URI manual review request/result types, and review evidence signatures. |
| `common/reviewModel.ts` | pure `TableReviewContext`, `TableReviewCandidate`, `TableReviewResult`, `TableReviewDecision`, factors, findings, `ReviewedTemplate`, and summary types. |
| `common/reviewSelector.ts` | pure Recipe selector evaluation against table model evidence. |
| `common/reviewCandidate.ts` | pure Recipe/UserTemplate candidate derivation from table evidence. |
| `common/reviewScoring.ts` | pure TableReviewCandidate scoring into `TableCandidateReview` factors/findings/status. |
| `common/reviewResult.ts` | pure TableReviewResult assembly from review context, candidates, scoring, and decision policy. |
| `browser/reviewService.ts` | injectable owner that reads URI-backed table model snapshots, runs pure review helpers, and maintains latest review summaries. |

Review candidate helpers live under `services/review/common` and produce
`TableReviewCandidate` values before Review status/policy projection. Template
Resolution and Template materialization services have retired and must not be
reintroduced as Review prerequisites or candidate-summary bridges.
User-template candidates must come through `IUserTemplateService` and
`UserTemplateSnapshot`. New decision logic and candidate derivation logic belong
in Review, not Template, TableModel, Explorer, or Slice.

Legacy raw-table manual review has retired from the Review owner contract. New
callers must use `reviewUriManualTemplate(...)` with a URI-backed table target.

## Rules

- `TableReviewDecision` is the only source for template usability and system
  application recommendations.
- System recommendation policy is Review-owned: it uses `TableCandidateReview`
  confidence, factors, findings, and Review policy, not retired apply fields.
- `TableReviewCandidate` is Review-owned pipeline data. It may carry candidate
  confidence, provider rank, reasons, diagnostics, optional captures, a
  review-owned executable interpretation, and the candidate interpretation
  fingerprint, but it must not carry final `ready` / `needsAdjustment` /
  `invalid` status, a template fingerprint, or the final `Template` snapshot. Review creates that
  snapshot only when a candidate is selected as `ReviewedTemplate`.
- `TableReviewContext` is the Review input model for URI-backed table targets:
  resource, optional sheetId, model/source versions, evidence fingerprint, and
  evidence projected from the table model. Candidate building and scoring must
  consume this context, not raw rows or Template service state.
- `TableReviewFinding` is the Review-owned explanation surface. Parser
  diagnostics may influence parseHealth and hard gates, but they are not the
  same type or owner as Review findings.
- Blocking Review findings, including parser-diagnostic hard gates projected
  from URI-backed table snapshots, must produce an `invalid`
  `TableReviewDecision` rather than a manual-adjustment state.
- `ReviewedTemplate.source` describes template provenance only: Recipe,
  UserTemplate, or inline. It must not encode manual, auto, saved-selection
  compatibility, user command, or system trigger.
- Execution trigger belongs to `SliceRequest.trigger`.
- Non-selected candidate records store summaries only. Detail rebuilding must
  verify Recipe/UserTemplate fingerprints and return a stale result when
  snapshots no longer match.
- Review evidence signatures include URI-backed `TableModel` source identity
  and `sourceVersion` / `modelVersion` when present, so reviewed facts can go
  stale on editor-model changes as well as raw table version changes.
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
- Do not read raw rows, rerun table-model detection, or delegate candidate
  derivation to Template.
- Do not store user template catalog data in Review records.
- Do not let Template, TableModel producers, Slice, or Explorer decide
  `systemRecommended`.
