# Conductor Service Instructions v7

This package extends v6 with coding-level contribution rules.

Start with `.github/instructions/service-architecture.instructions.md`.

Then read:

- `.github/instructions/coding-guidelines.instructions.md` for Command vs Action2 vs Action, files/explorer/import naming, and manager/controller/store/model rules.
- `.github/instructions/commands.instructions.md` for command entry and service dispatch.
- `.github/instructions/records.instructions.md` for field-level record/state/model definitions.
- `.github/instructions/service-components.instructions.md` for service/controller/store/model/provider/adapter/planner/cache naming rules.
- The domain-specific instruction file for the service you are changing.

# Changelog

## v5
- command/action/controller/service responsibility split;
- explicit command target rules;
- service-specific command dispatch tables;
- recommended command files per feature;
- migration note for old view-host dispatch patterns such as commands reaching into `FilesPaneHost`.

## v6
- specifically fixes the prior weakness where documents listed only type names or recommended files without explaining the fields and ownership of the records inside them.

## v7
- also corrects the previous over-abstraction around `IFileImportService`: the target architecture uses files import/export workflow helpers and `fileConverter.ts`, not a new import service interface by default.
