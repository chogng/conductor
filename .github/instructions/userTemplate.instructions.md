---
description: UserTemplate service - user template catalog snapshots consumed by Review candidate builders and manual Review.
applyTo: 'src/cs/workbench/services/userTemplate/**,src/cs/workbench/contrib/userTemplate/**'
---
# UserTemplate

`UserTemplate` is the user-template catalog domain. It wraps user-authored,
imported, or review-confirmed `Template` snapshots with catalog provenance,
scope, versioning, and fingerprints. It is not the core `Template` spec and it
is not the Template UI form state.

`IUserTemplateService` owns native UserTemplate CRUD/import/export and catalog
snapshots. Review candidate builders, Review manual paths, Template UI, Explorer
template pickers, and explicit Slice template lookup consume
`UserTemplateSnapshot` or `getTemplate(id)` instead of reading a template
catalog.

## Ownership

`IUserTemplateService` owns:

- user-template catalog snapshots and effective fingerprints;
- user-template lookup by id;
- native user-template CRUD/import/export;
- user-template change events used by Review candidate derivation, Review manual
  paths, and Template UI projections.

It does not own:

- the core `Template` data structure;
- native catalog persistence through `IUserTemplateStoreService`;
- Template editor selected-template/form state;
- Recipe dataRange/blockPartition/physicalLayout/logicalRelation interpretation;
- Review decisions or system application recommendations;
- Slice execution, queue state, or `SliceRun` records.

## Flow

```txt
UserTemplate create/update/delete/import
  -> IUserTemplateService
  -> IUserTemplateStoreService
  -> userTemplateChanged
  -> Review candidate builder rereads table model + RecipeSnapshot + UserTemplateSnapshot
  -> IReviewService reviews candidates
  -> ReviewResult / ReviewedTemplate
```

JSON import/export:

```txt
Template import/export command
  -> templateImportExport reads JSON files or exports native payloads through save-file/write or browser download
  -> IUserTemplateService imports/exports native UserTemplate payloads
```

Manual execution:

```txt
user template picker / saved-selection compatibility picker
  -> IReviewService.reviewUriForExecution({ resource, sheetId })
  -> IReviewService.reviewUriManualTemplate(saved user template id)
  -> IUserTemplateService.getTemplate(...)
  -> ManualTemplateReviewResult.ready
  -> SliceUriRequest(trigger = userCommand)
```

## Rules

- `UserTemplateSnapshot.effectiveFingerprint` is the Review candidate
  derivation and Review staleness input for user-template candidates.
- `UserTemplate.template` is a snapshot. Review must store the selected
  executable template snapshot in `ReviewDecision.ready.reviewedTemplate`.
- Native UserTemplates are persisted by scope: `global` in profile storage and
  `workspace` in workspace storage. Do not store them in Session.
- Template UI library management reads and writes through
  `IUserTemplateService`. The form uses `TemplateEditorConfig` as an editor
  view model, but persistence must
  materialize a `UserTemplate.template` snapshot.
- UserTemplate import/export payload semantics stay on `IUserTemplateService`.
  File-system writes and browser download fallback are Template UI/platform
  transfer concerns, not catalog persistence.

## Do Not

- Do not call UserTemplate a Recipe or a Template sub-type.
- Do not store UserTemplate catalog records in Session.
- Do not let UserTemplate evaluate table model or choose candidates.
- Do not let Slice enumerate or evaluate UserTemplate catalogs; Slice may only
  resolve an explicit selected template id through `IUserTemplateService`.
