---
description: UserDataProfile resources - profile-scoped user data resource persistence and domain resource boundaries.
applyTo: 'src/cs/workbench/services/userDataProfile/**'
---
# UserDataProfile

`IUserDataProfileResourceService` owns profile-scoped user-data resource
persistence and resource import/export aggregation. It is the shared profile
resource boundary for domain payloads such as UserTemplate catalogs.

This service does not own individual domain semantics. Domain services validate,
normalize, and interpret their payloads, then read/write their profile resource
through `IUserDataProfileResourceService` or register a resource handler for the
profile export/import pipeline.

## Flow

```txt
domain service/store
  -> IUserDataProfileResourceService.readResource/writeResource(resource id)
  -> profile-scoped storage backing
  -> onDidChangeResource(resource id)
  -> domain service/store rereads resource and publishes domain change events
```

Profile export/import:

```txt
domain import/export service
  -> registerResourceHandler(resource id, getContent/applyContent)
  -> IUserDataProfileResourceService.exportProfile()
  -> conductor.userDataProfile aggregate payload
  -> IUserDataProfileResourceService.importProfileFromPayload(...)
  -> handler.applyContent(resource content)
  -> domain service validates and applies resource content
```

## Rules

- Keep profile resource ids with `services/userDataProfile/common/userDataProfile.ts`.
- Profile aggregate payloads contain resource ids plus opaque string content.
  UserDataProfile does not inspect resource-specific JSON beyond the aggregate
  envelope.
- Do not expose raw storage keys to domain services for profile-scoped
  resources.
- Do not put workspace-scoped overlays into UserDataProfile; workspace resource
  state stays with the workspace owner or workspace storage.
- Do not move domain payload validation into UserDataProfile. UserTemplate,
  settings, snippets, or future resources own their own payload semantics.
- Do not introduce profile switching/current-profile lifecycle here until the
  product needs multiple profiles. The current service is a resource abstraction
  over the active profile scope.
