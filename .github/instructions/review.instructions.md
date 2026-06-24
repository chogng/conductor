---
description: Review service - Template candidate review, selected ReviewedTemplate snapshots, manual adjustment state, and system-application recommendations.
applyTo: 'src/cs/workbench/services/review/**,src/cs/workbench/contrib/review/**'
---
# Review

Review is the owner of Template usability and application decisions for raw
tables. It consumes raw table evidence plus Recipe/UserTemplate candidate
sources and writes auditable `RawTableReviewRecord` facts.

## Ownership

`IReviewService` owns:

- deriving Template drafts from Recipe and UserTemplate snapshots;
- reviewing candidates into `ready`, `needsAdjustment`, or `invalid`;
- selecting the `ReviewedTemplate` snapshot when a candidate is ready;
- deciding `systemRecommended` versus `userActionRequired`;
- returning structured manual-template review results;
- committing `RawTableReviewRecord` values through Session.

It does not own raw row profiling, Recipe catalog storage, UserTemplate catalog
CRUD, Slice planning/execution, Explorer UI projection, or Template editor view
state.

`ReviewApplyContribution` is a bridge only. It listens to `reviewChanged`,
reads `ReviewDecision`, applies idempotency/staleness guards, and submits Slice
requests. It must not inspect confidence, candidate margins, or diagnostic
severity to decide whether a template is usable.

## Flow

```txt
evidenceChanged / recipeChanged / userTemplateChanged / reviewPolicyChanged
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
user command / legacy saved template picker / inline template editor
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

During migration, Review may reuse TemplateResolution candidate helpers.
User-template candidates must come through `IUserTemplateService`, even when
that service is projecting the legacy saved-template catalog. New decision
logic still belongs in Review, not TemplateResolution, Assessment, Explorer, or
Slice.

## Rules

- `ReviewDecision` is the only source for template usability and system
  application recommendations.
- `ReviewedTemplate.source` describes template provenance only: Recipe,
  UserTemplate, legacy saved template, or inline. It must not encode manual,
  auto, user command, or system trigger.
- Execution trigger belongs to `SliceRequest.trigger`.
- Non-selected candidate records store summaries only. Detail rematerialization
  must verify Recipe/UserTemplate fingerprints and return a stale result when
  snapshots no longer match.
- Bump `reviewPolicyVersion` whenever thresholds, conflict rules, critical
  diagnostic handling, override rules, or source priority changes.
- Explorer reads `RawTableReviewRecord` and Slice state as projection inputs;
  it does not perform Review policy checks.
- Manual Review requests may accept legacy saved Template ids during the
  UserTemplate migration, but lookup must go through `IUserTemplateService`.

## Do Not

- Do not call Slice from `ReviewService`; use `ReviewApplyContribution` or a
  user-command controller.
- Do not read raw rows or rerun evidence detection.
- Do not store user template catalog data in Review records.
- Do not let Assessment, TemplateResolution, Slice, or Explorer decide
  `systemRecommended`.
