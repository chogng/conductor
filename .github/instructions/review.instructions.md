---
description: Review service - Template candidate review, selected ReviewedTemplate snapshots, manual adjustment state, and system-application recommendations.
applyTo: 'src/cs/workbench/services/review/**,src/cs/workbench/contrib/review/**'
---
# Review

Review is the owner of Template usability and application decisions for raw
tables. It consumes materialized Template candidates and writes auditable
`RawTableReviewRecord` facts.

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
- committing `RawTableReviewRecord` values through Session.

It does not own raw row profiling, Recipe catalog storage, UserTemplate catalog
CRUD, Template materialization, Slice planning/execution, Explorer UI
projection, or Template editor view state.

`ReviewApplyContribution` is a bridge only. It listens to `reviewChanged`,
reads `ReviewDecision`, applies idempotency/staleness guards, and submits Slice
requests. It must not inspect confidence, candidate margins, or diagnostic
severity to decide whether a template is usable.

## Flow

```txt
templateCandidatesChanged / reviewPolicyChanged
  -> ReviewContribution
  -> IReviewService.deriveAndReview(...)
  -> ISessionService.commitRawTableReviews(...)
  -> reviewChanged
```

Automatic execution:

```txt
reviewChanged
  -> ReviewApplyContribution
  -> ReviewDecision.ready + application.systemRecommended
  -> idempotency guard
  -> SliceRequest(trigger = reviewDecision)
  -> ISliceService.submit(...)
```

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
| `browser/reviewService.ts` | injectable owner that reads snapshots, runs pure review helpers, and commits review records. |
| `browser/review.contribution.ts` | lifecycle subscriber for evidence, Recipe, UserTemplate, and policy changes. |
| `browser/reviewApply.contribution.ts` | no-UI bridge from system-recommended Review decisions to Slice requests. |

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
- Explorer reads `RawTableReviewRecord` and Slice state as projection inputs;
  it does not perform Review policy checks.
- Manual Review requests may accept `savedTemplate` compatibility selections,
  but lookup must go through `IUserTemplateService` and the resulting
  `ReviewedTemplate.source` must be `userTemplate`.

## Do Not

- Do not call Slice from `ReviewService`; use `ReviewApplyContribution` or a
  user-command controller.
- Do not read raw rows, rerun table-model detection, or materialize Recipes.
- Do not store user template catalog data in Review records.
- Do not let Template materializers, TableModel producers, Slice, or Explorer decide
  `systemRecommended`.
