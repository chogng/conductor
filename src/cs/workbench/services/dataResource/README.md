# Data Resource Service

`services/dataResource` is the workbench-level owner for Conductor data
resource snapshots. It sits below Review, Table UI, Search, Slice, and similar
domain consumers, but above `base` / `platform` resource bytes.

This is intentionally not a `base` or `platform` service. Structured content
contains Conductor domain facts such as columns, semantic title matches,
X ranges/groups, data blocks, binding candidates, measurement blocks, parser
diagnostics, source versions, and sheet sub-targets. Those facts are shared
workbench domain data, not generic filesystem or URI infrastructure.

Current architecture:

- public callers depend on `IDataResourceService` and structured-content
  snapshots;
- structured-content evidence, projection, and grid snapshot contracts are
  owned by `services/dataResource/common/structuredContent.ts`;
- `IDataResourceContentService` owns reusable physical content references below
  both DataResource evidence and table-model materialization;
- Review can resolve evidence directly from the physical content reference
  without waiting for an `ITableModel` to enter the ready state;
- Table materializes the same referenced content into its model only when a
  table consumer requests it;
- Review and Slice consume data-resource snapshots and must not directly depend
  on Table UI/view state or table model lifecycle.

See `ALGORITHM.md` / `ALGORITHM.zh-CN.md` for the target segmentation and X/Y
range evidence algorithm.

Target direction:

```txt
URI/resource
  -> IDataResourceContentService
  -> physical content snapshot
     -> IDataResourceService -> evidence -> Review / Search / Slice
     -> ITableModelService -> Table UI
```

If structured content later becomes larger than this service should own, split
the internals by responsibility. Keep `IDataResourceService` as the stable
workbench entry point and move generic byte/resource access down to platform
only when it has no Conductor measurement or matrix semantics.
