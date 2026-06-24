---
description: Review service - Template candidate review, selected ReviewedTemplate snapshots, manual adjustment state, and system-application recommendations.
applyTo: 'src/cs/workbench/services/review/**,src/cs/workbench/contrib/review/**'
---
# Review

Review is the owner of Template usability and application decisions for raw
tables. It consumes raw table evidence plus Recipe/UserTemplate candidate
sources and writes auditable `RawTableReviewRecord` facts.

The primary template path is Recipe/UserTemplate -> TemplateDraft/Template ->
Review -> Slice, with Assessment supplying RawTableEvidence as input. Review is
the first layer that may choose usability or system application.

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
| `common/templateDraft.ts` | internal full candidate draft shape before Review status/policy projection. |
| `common/automaticTemplateDraftProvider.ts` | Review-owned pure provider combining Recipe and UserTemplate draft sources. |
| `common/recipeSelectorEvaluator.ts` | pure Recipe selector evaluator against Assessment evidence. |
| `common/recipeTemplateDraftProvider.ts` | materializes Recipe selector/projection matches into `TemplateDraft` values. |
| `common/userTemplateDraftProvider.ts` | derives UserTemplate compatibility drafts from `UserTemplateSnapshot`. |
| `browser/reviewService.ts` | injectable owner that reads snapshots, runs pure review helpers, and commits review records. |
| `browser/review.contribution.ts` | lifecycle subscriber for evidence, Recipe, UserTemplate, and policy changes. |
| `browser/reviewApply.contribution.ts` | no-UI bridge from system-recommended Review decisions to Slice requests. |

During migration, Template Resolution may reuse Review-owned pure draft
providers only as a legacy compatibility bridge for old candidate summaries.
It is not a prerequisite for Review and is not on the primary path.
User-template candidates must come through `IUserTemplateService` and
`UserTemplateSnapshot`. New decision logic and new provider logic still belong
in Review, not TemplateResolution, Assessment, Explorer, or Slice.

## Rules

- `ReviewDecision` is the only source for template usability and system
  application recommendations.
- System recommendation policy is Review-owned: it uses `TemplateReview`
  confidence and Review diagnostics/policy, not Assessment auto-apply fields.
- `TemplateDraft` is Review pipeline data. It may carry derivation confidence,
  derivation reasons, diagnostics, and optional captures, but it must not carry
  final `ready` / `needsAdjustment` / `invalid` status.
- `ReviewedTemplate.source` describes template provenance only: Recipe,
  UserTemplate, or inline. It must not encode manual, auto, saved-selection
  compatibility, user command, or system trigger.
- Execution trigger belongs to `SliceRequest.trigger`.
- Non-selected candidate records store summaries only. Detail rematerialization
  must verify Recipe/UserTemplate fingerprints and return a stale result when
  snapshots no longer match.
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
- Do not read raw rows or rerun evidence detection.
- Do not store user template catalog data in Review records.
- Do not let Assessment, TemplateResolution, Slice, or Explorer decide
  `systemRecommended`.
