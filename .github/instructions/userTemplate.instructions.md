---
description: UserTemplate service - user template catalog snapshots consumed by Review candidate providers.
applyTo: 'src/cs/workbench/services/userTemplate/**,src/cs/workbench/contrib/userTemplate/**'
---
# UserTemplate

`UserTemplate` is the user-template catalog domain. It wraps user-authored or
imported `Template` snapshots with catalog provenance, versioning, and
fingerprints. It is not the core `Template` spec and it is not the Template UI
form state.

During migration, `IUserTemplateService` may project the legacy saved-template
catalog from `ITemplateService` into `UserTemplateSnapshot`. New Review code
must consume the `UserTemplateSnapshot` rather than reading the legacy template
catalog directly.

## Ownership

`IUserTemplateService` owns:

- user-template catalog snapshots and effective fingerprints;
- user-template lookup by id;
- user-template change events used by Review invalidation;
- migration projection from legacy saved templates while Template CRUD is
  still backed by `ITemplateService`.

It does not own:

- the core `Template` data structure;
- Template editor selected-template/form state;
- Recipe selector/projection interpretation;
- Review decisions or system application recommendations;
- Slice execution, queue state, or `SliceRun` records.

## Flow

```txt
legacy TemplateService catalog change
  -> UserTemplateService projects UserTemplateSnapshot
  -> onDidChangeUserTemplates
  -> ReviewContribution rereads evidence + RecipeSnapshot + UserTemplateSnapshot
  -> IReviewService.deriveAndReview(...)
  -> RawTableReviewRecord
```

Manual execution:

```txt
user template picker / legacy saved template picker
  -> IReviewService.reviewManualTemplate(...)
  -> IUserTemplateService.getTemplate(...)
  -> ManualTemplateReviewResult.ready
  -> SliceRequest(trigger = userCommand)
```

## Rules

- `UserTemplateSnapshot.effectiveFingerprint` is the Review staleness input for
  user-template candidates.
- `UserTemplate.template` is a snapshot. Review must store the selected
  executable template snapshot in `ReviewDecision.ready.reviewedTemplate`.
- Legacy saved templates projected through `IUserTemplateService` should use
  `source: "legacyPreset"` until a native UserTemplate store exists.
- Template UI may keep using `ITemplateService` during migration, but Review
  candidate derivation must not read `ITemplateService` directly.

## Do Not

- Do not call UserTemplate a Recipe or a Template sub-type.
- Do not store UserTemplate catalog records in Session.
- Do not let UserTemplate evaluate raw table evidence or choose candidates.
- Do not let Slice read UserTemplate catalogs.
