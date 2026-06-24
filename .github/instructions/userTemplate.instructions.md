---
description: UserTemplate service - user template catalog snapshots consumed by Review candidate providers.
applyTo: 'src/cs/workbench/services/userTemplate/**,src/cs/workbench/contrib/userTemplate/**'
---
# UserTemplate

`UserTemplate` is the user-template catalog domain. It wraps user-authored,
imported, or review-confirmed `Template` snapshots with catalog provenance,
scope, versioning, and fingerprints. It is not the core `Template` spec and it
is not the Template UI form state.

`IUserTemplateService` owns native UserTemplate CRUD/import/export and merges
that native catalog with the legacy saved-template projection during migration.
New Review code must consume the `UserTemplateSnapshot` rather than reading the
legacy template catalog directly.

## Ownership

`IUserTemplateService` owns:

- user-template catalog snapshots and effective fingerprints;
- user-template lookup by id;
- native user-template CRUD/import/export;
- user-template change events used by Review invalidation;
- migration projection from legacy saved templates while Template CRUD is
  still backed by `ITemplateService`.

It does not own:

- the core `Template` data structure;
- native catalog persistence through `IUserTemplateStoreService`;
- Template editor selected-template/form state;
- Recipe selector/projection interpretation;
- Review decisions or system application recommendations;
- Slice execution, queue state, or `SliceRun` records.

## Flow

```txt
UserTemplate create/update/delete/import
  -> IUserTemplateService
  -> IUserTemplateStoreService
  -> userTemplateChanged
  -> ReviewContribution rereads evidence + RecipeSnapshot + UserTemplateSnapshot
```

Migration projection:

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
- Native UserTemplates are persisted by scope: `global` in profile storage and
  `workspace` in workspace storage. Do not store them in Session.
- Native UserTemplates win over legacy projections when ids collide.
- Legacy saved templates projected through `IUserTemplateService` use
  `source: "legacyPreset"` until the old saved-template catalog is retired.
- Template UI library management reads and writes through
  `IUserTemplateService`. The existing form may keep using legacy
  `TemplateApplyConfig` as an editor view model, but persistence must
  materialize a `UserTemplate.template` snapshot.

## Do Not

- Do not call UserTemplate a Recipe or a Template sub-type.
- Do not store UserTemplate catalog records in Session.
- Do not let UserTemplate evaluate raw table evidence or choose candidates.
- Do not let Slice read UserTemplate catalogs.
