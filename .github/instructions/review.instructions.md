---
description: Review service - Template candidate review, selected ReviewedTemplate snapshots, manual adjustment state, and system-application recommendations.
applyTo: 'src/cs/workbench/services/review/**,src/cs/workbench/contrib/review/**'
---
# Review

Review is the owner of Template usability and application decisions for
URI-backed table resources. It consumes materialized Template candidates and
keeps latest review results keyed by `resource + sheetId`.

The primary template path is TableModel + Recipe/UserTemplate -> Template ->
Review -> Slice. Review is the first layer that may choose usability or system
application.

## Ownership

`IReviewService` owns:

- reviewing Template candidates materialized by Template;
- reviewing candidates into `ready`, `needsAdjustment`, or `invalid`;
- selecting the `ReviewedTemplate` snapshot when a candidate is ready;
- deciding `systemRecommended` versus `userActionRequired`;
- returning structured manual-template review results;
- maintaining URI-backed latest review summaries keyed by `resource + sheetId`
  for Explorer decorations and hover;

It does not own raw row profiling, Recipe catalog storage, UserTemplate catalog
CRUD, Template materialization, Slice planning/execution, Explorer UI
projection, or Template editor view state.

## Flow

URI-backed Explorer summary:

```txt
Explorer decoration / hover
  -> IReviewService.getLatestReviewSummary({ resource, sheetId })
  -> ITableModelService.createModelReference(resource, source)
  -> TableModelSnapshot content + source/model version
  -> ITableModelProducerService.getOrCreate(...)
  -> ITemplateMaterializationService materializes Template candidates
  -> ReviewService reviews candidates
  -> Review service-local summary cache keyed by resource + sheetId
  -> reviewChanged
  -> Explorer rereads latest Review summary
```

This summary cache is service-local. It is invalidated by URI-backed table
model changes, Recipe changes, and UserTemplate changes. Explorer must not fall
back to Session raw-table records for URI-backed semantic decorations.

Automatic execution from Review is not wired through a Session review bridge.
When automatic execution is reintroduced, it must submit explicit URI-backed
`SliceRequest` values from the current `resource + sheetId` review result, with
idempotency and staleness guards based on model/source versions and review
signatures.

Manual execution:

```txt
user command / UserTemplate picker / saved-selection compatibility picker / inline template editor
  -> IReviewService.reviewManualTemplate(...)
  -> ManualTemplateReviewResult
  -> ready result only
  -> SliceRequest(trigger = userCommand)
  -> ISliceService.submit(...)
```

## Core Files

| File | Responsibility |
| --- | --- |
| `common/review.ts` | service contract, Review records, candidate summaries, decisions, manual review results, and signatures. |
| `browser/reviewService.ts` | injectable owner that reads URI-backed table model snapshots, runs pure review helpers, and maintains latest review summaries. |

Template materializers live under `services/template/common` and produce
`TemplateDraft` values before Review status/policy projection. Template
Resolution has retired and must not be reintroduced as a Review prerequisite or
candidate-summary bridge.
User-template candidates must come through `IUserTemplateService` and
`UserTemplateSnapshot`. New decision logic belongs in Review; new provider and
materialization logic belongs in Template, not TableModel, Explorer, or Slice.

## Rules

- `ReviewDecision` is the only source for template usability and system
  application recommendations.
- System recommendation policy is Review-owned: it uses `TemplateReview`
  confidence and Review diagnostics/policy, not retired apply fields.
- `TemplateDraft` is Template materialization pipeline data consumed by Review.
  It may carry derivation confidence,
  derivation reasons, diagnostics, and optional captures, but it must not carry
  final `ready` / `needsAdjustment` / `invalid` status.
- `ReviewedTemplate.source` describes template provenance only: Recipe,
  UserTemplate, or inline. It must not encode manual, auto, saved-selection
  compatibility, user command, or system trigger.
- Execution trigger belongs to `SliceRequest.trigger`.
- Non-selected candidate records store summaries only. Detail rematerialization
  must verify Recipe/UserTemplate fingerprints and return a stale result when
  snapshots no longer match.
- Review evidence signatures include URI-backed `TableModel` source identity
  and `sourceVersion` / `modelVersion` when present, so reviewed facts can go
  stale on editor-model changes as well as raw table version changes.
- Bump `reviewPolicyVersion` whenever thresholds, conflict rules, critical
  diagnostic handling, override rules, or source priority changes.
- Explorer reads Review summaries and Slice state as projection inputs; it does
  not perform Review policy checks.
- Manual Review requests may accept `savedTemplate` compatibility selections,
  but lookup must go through `IUserTemplateService` and the resulting
  `ReviewedTemplate.source` must be `userTemplate`.

## Do Not

- Do not call Slice from `ReviewService`; use an explicit user-command or
  URI-backed execution controller that submits `SliceRequest` values.
- Do not read raw rows, rerun table-model detection, or materialize Recipes.
- Do not store user template catalog data in Review records.
- Do not let Template materializers, TableModel producers, Slice, or Explorer decide
  `systemRecommended`.
