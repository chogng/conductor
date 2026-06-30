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

`IUserTemplateImportExportService` owns native `conductor.userTemplate` payload
validation and import/export delegation. It also registers the UserTemplate
resource handler used by the UserDataProfile aggregate import/export pipeline.
Dialogs, file reads/writes, and browser download fallback stay with the Template
UI import/export helper.

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
- DataResource evidence production or semantic title matching;
- Review decisions or system application recommendations;
- Slice execution, queue state, or `SliceRun` records.

## Flow

```txt
UserTemplate create/update/delete/import
  -> IUserTemplateService
  -> IUserTemplateStoreService
  -> IUserDataProfileResourceService for profile-scoped templates
  -> IStorageService workspace storage for workspace-scoped templates
  -> userTemplateChanged
  -> Review candidate builder rereads DataResource evidence + UserTemplateSnapshot
  -> IReviewService reviews candidates
  -> ReviewResult / ReviewedTemplate
```

JSON import/export:

```txt
Template import/export command
  -> templateImportExport reads JSON files or exports native payloads through save-file/write or browser download
  -> IUserTemplateImportExportService validates native conductor.userTemplate payloads
  -> IUserTemplateService imports/exports native UserTemplate records
```

Profile export/import:

```txt
IUserTemplateImportExportService
  -> register UserDataProfileResourceId.UserTemplates handler
  -> profile export serializes profile-scoped UserTemplates as conductor.userTemplate JSON content
  -> profile import validates conductor.userTemplate JSON content
  -> replace profile-scoped UserTemplates through IUserTemplateService
  -> workspace-scoped UserTemplates stay untouched
```

Manual execution:

```txt
user template picker / saved-selection compatibility picker
  -> IReviewService.reviewResourceForExecution({ resource, sheetId })
  -> IReviewService.reviewResourceManualTemplate(saved user template id)
  -> IUserTemplateService.getTemplate(...)
  -> ManualTemplateReviewResult.ready
  -> SliceResourceRequest(trigger = userCommand)
```

## Rules

- `UserTemplateSnapshot.effectiveFingerprint` is the Review candidate
  derivation and Review staleness input for user-template candidates.
- `UserTemplate.template` is a snapshot. Review must store the selected
  executable template snapshot in `ReviewDecision.ready.reviewedTemplate`.
- Native UserTemplates are persisted by scope: `profile` as a UserDataProfile
  resource and `workspace` in workspace storage. Do not store them in Session.
- Template UI library management reads and writes through
  `IUserTemplateService`. The form uses `TemplateEditorConfig` as an editor
  view model, but persistence must
  materialize a `UserTemplate.template` snapshot.
- UserTemplate import/export payload semantics stay in the UserTemplate domain.
  `IUserTemplateImportExportService` is the workflow boundary for native payload
  validation, standalone JSON import/export delegation, and the UserDataProfile
  resource handler. Profile resource import replaces only profile-scoped
  templates; standalone JSON import preserves the normal merge/duplicate-skip
  behavior. File-system writes and browser download fallback are Template
  UI/platform transfer concerns, not catalog persistence.

## Core Files

| File | Responsibility |
| --- | --- |
| `common/userTemplate.ts` | UserTemplate contracts, native payload records, and service interfaces. |
| `common/userTemplateCatalog.ts` | Pure catalog creation, update, snapshot, and import-entry normalization helpers. |
| `browser/userTemplateService.ts` | Injectable UserTemplate catalog owner for CRUD/import/export APIs and catalog change events. |
| `browser/userTemplateStoreService.ts` | Native catalog persistence bridge: profile templates through UserDataProfile resources and workspace templates through workspace storage. |
| `browser/userTemplateImportExportService.ts` | Native `conductor.userTemplate` payload validation and import/export delegation. |

## Do Not

- Do not call UserTemplate a Recipe or a Template sub-type.
- Do not store UserTemplate catalog records in Session.
- Do not let UserTemplate evaluate table model or choose candidates.
- Do not let Slice enumerate or evaluate UserTemplate catalogs; Slice may only
  resolve an explicit selected template id through `IUserTemplateService`.
