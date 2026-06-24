---
description: UserTemplate service - user template catalog snapshots consumed by Template materializers and manual Review.
applyTo: 'src/cs/workbench/services/userTemplate/**,src/cs/workbench/contrib/userTemplate/**'
---
# UserTemplate

`UserTemplate` is the user-template catalog domain. It wraps user-authored,
imported, or review-confirmed `Template` snapshots with catalog provenance,
scope, versioning, and fingerprints. It is not the core `Template` spec and it
is not the Template UI form state.

`IUserTemplateService` owns native UserTemplate CRUD/import/export and catalog
snapshots. Template materializers, Review manual paths, Template UI, Explorer
template pickers, and explicit Slice template lookup consume
`UserTemplateSnapshot` or `getTemplate(id)` instead of reading a template
catalog.

## Ownership

`IUserTemplateService` owns:

- user-template catalog snapshots and effective fingerprints;
- user-template lookup by id;
- native user-template CRUD/import/export;
- user-template change events used by Template materialization, Review manual
  paths, and Template UI projections.

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
  -> Template materializer rereads table facts + RecipeSnapshot + UserTemplateSnapshot
  -> IReviewService reviews materialized candidates
  -> RawTableReviewRecord
```

Manual execution:

```txt
user template picker / saved-selection compatibility picker
  -> IReviewService.reviewManualTemplate(...)
  -> IUserTemplateService.getTemplate(...)
  -> ManualTemplateReviewResult.ready
  -> SliceRequest(trigger = userCommand)
```

## Rules

- `UserTemplateSnapshot.effectiveFingerprint` is the Template materialization
  and Review staleness input for user-template candidates.
- `UserTemplate.template` is a snapshot. Review must store the selected
  executable template snapshot in `ReviewDecision.ready.reviewedTemplate`.
- Native UserTemplates are persisted by scope: `global` in profile storage and
  `workspace` in workspace storage. Do not store them in Session.
- Template UI library management reads and writes through
  `IUserTemplateService`. The existing form may keep using
  `TemplateApplyConfig` as an editor view model, but persistence must
  materialize a `UserTemplate.template` snapshot.

## Do Not

- Do not call UserTemplate a Recipe or a Template sub-type.
- Do not store UserTemplate catalog records in Session.
- Do not let UserTemplate evaluate table facts or choose candidates.
- Do not let Slice enumerate or evaluate UserTemplate catalogs; Slice may only
  resolve an explicit selected template id through `IUserTemplateService`.
