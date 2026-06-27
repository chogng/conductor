# Data Resource Service

`services/dataResource` is the workbench-level owner for Conductor data
resource snapshots. It sits below Review, Table UI, Search, Slice, and similar
domain consumers, but above `base` / `platform` resource bytes.

This is intentionally not a `base` or `platform` service. Structured content
contains Conductor domain facts such as columns, layout candidates, measurement
blocks, semantic roles, parser diagnostics, source versions, and sheet
sub-targets. Those facts are shared workbench domain data, not generic
filesystem or URI infrastructure.

Current migration state:

- public callers depend on `IDataResourceService` and structured-content
  snapshots;
- the first browser implementation still materializes snapshots through
  `ITableModelService`;
- that table-model dependency is an implementation bridge, not the target
  ownership boundary;
- Review and Slice consume data-resource snapshots and must not directly depend
  on Table UI/view state or table model lifecycle.

Target direction:

```txt
URI/resource
  -> IDataResourceService
  -> structured content snapshot
  -> Review / Table UI / Search / Slice consumers
```

If structured content later becomes larger than this service should own, split
the internals by responsibility. Keep `IDataResourceService` as the stable
workbench entry point and move generic byte/resource access down to platform
only when it has no Conductor measurement or matrix semantics.
