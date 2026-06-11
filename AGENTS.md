# Conductor Studio Instructions

when you have any questions, see the [Conductor Instructions](.github/conductor-instructions.md).

when you coding, see the upstream architechture [`C:\Users\lanxi\Desktop\vscode`].

when migrates the responsibility, see the [Migration Rules](.github/migration-rules.md).

before you write or edit any code, you MUST first read the [Architecture Instructions](.github/instructions/architecture.instructions.md) and the [Coding Guidelines](.github/instructions/coding-guidelines.instructions.md).

when coding under a path with a matching `.github/instructions/*.instructions.md` file, read that instruction before editing code in that area.

when writing or editing naming, command/action ids, command handlers, action registration, contribution wiring, service calls, or responsibility boundaries, you MUST first read [Architecture Instructions](.github/instructions/architecture.instructions.md), [Commands and Dispatch](.github/instructions/commands.instructions.md), [Coding Guidelines](.github/instructions/coding-guidelines.instructions.md), and the matching module instruction such as [Files Capability / Explorer UI](.github/instructions/files.instructions.md). Do not infer these rules from memory.

when coding, prefer local modifications and existing structure; create new files only when the responsibility boundary is clear, reuse value is real, or keeping the change in the existing file would make it meaningfully worse.

when fixing a bug, do not make a local workaround first. Before editing, identify the root-cause chain from user symptom to triggering entry point, shared owner, and incorrect owner behavior. If the affected responsibility has an upstream VS Code counterpart, inspect `C:\Users\lanxi\Desktop\vscode` and state whether the fix follows or intentionally diverges from upstream. Only edit the owning service/component/primitive unless the local surface truly owns the behavior.

after each code update, check whether sequence diagrams in the matching module instructions need to be updated, and update them when the behavior or call flow changes.
