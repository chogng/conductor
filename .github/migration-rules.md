# Responsibility Migration Rules

- Do not migrate responsibilities by mechanically replacing `import` paths.
- A migrated responsibility may be a module, file, type, function, field, state value, cache entry, workflow step, helper, or piece of business logic.
- When a responsibility has an upstream counterpart, verify the exact upstream file path, exported symbols, and public method names before documenting or introducing the target shape.
- Do not invent upstream-looking service APIs, filenames, or classes from a conceptual responsibility. If a method or file is Conductor-specific, label it as Conductor-specific and explain why it diverges from upstream.
- Prefer upstream naming and API shape when the upstream responsibility exists. Diverge only when Conductor has a real product/domain requirement that upstream does not have.
- Before migration, identify the full impact surface through imports, references, symbol search, and typecheck errors.
- For each caller, classify its relationship to the migrated responsibility:
  - owner: owns the data or logic;
  - orchestrator: triggers or coordinates the workflow;
  - consumer: reads or displays the result;
  - invalid dependency: directly depends on internal implementation details.
- Decide the correct ownership boundary before changing callers.
- External code should depend on stable service, API, snapshot, or display-model interfaces, not internal records, models, caches, or implementation files.
- Preserve existing behavior during migration unless the task explicitly requires a behavior change. Any intentional behavior change must be called out separately.
- After migration, remove or deprecate the old entry point.
- Use typecheck and tests to catch remaining references.
- Do not leave long-term dual paths for the same responsibility.
