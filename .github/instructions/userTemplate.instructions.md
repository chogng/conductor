---
description: UserTemplate service - user template catalog snapshots consumed by Review candidate providers.
applyTo: 'src/cs/workbench/services/userTemplate/**,src/cs/workbench/contrib/userTemplate/**'
---
# UserTemplate

`UserTemplate` is the user-template catalog domain. It wraps user-authored,
imported, or review-confirmed `Template` snapshots with catalog provenance,
scope, versioning, and fingerprints. It is not the core `Template` spec and it
is not the Template UI form state.

`IUserTemplateService` owns native UserTemplate CRUD/import/export and catalog
snapshots. Review, Template UI, Explorer template pickers, explicit Slice
template lookup, and TemplateResolution legacy compatibility code consume
`UserTemplateSnapshot` or `getTemplate(id)` instead of reading a legacy template
catalog.

## Ownership

`IUserTemplateService` owns:

- user-template catalog snapshots and effective fingerprints;
- user-template lookup by id;
- native user-template CRUD/import/export;
- user-template change events used by Review and by TemplateResolution legacy
  compatibility invalidation.

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
  -> IReviewService.deriveAndReview(...)
  -> RawTableReviewRecord
```

TemplateResolution may also observe `userTemplateChanged` while the legacy
compatibility bridge exists, but it only refreshes old candidate-summary
records and is not on the primary Recipe/UserTemplate -> TemplateDraft/Template
-> Review -> Slice path.

Manual execution:

```txt
user template picker / saved-selection compatibility picker
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
- Template UI library management reads and writes through
  `IUserTemplateService`. The existing form may keep using legacy
  `TemplateApplyConfig` as an editor view model, but persistence must
  materialize a `UserTemplate.template` snapshot.

## Do Not

- Do not call UserTemplate a Recipe or a Template sub-type.
- Do not store UserTemplate catalog records in Session.
- Do not let UserTemplate evaluate raw table evidence or choose candidates.
- Do not let Slice enumerate or evaluate UserTemplate catalogs; Slice may only
  resolve an explicit selected template id through `IUserTemplateService`.
