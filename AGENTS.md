不管你做什么，这是最重要的第一点:严格禁止兜底，严格禁止把逻辑换个地方充当改正，严格改个声明/name就充当改正，严格遵守前面几个'严格....'
逻辑完善的情况下，旧兼容直接退场
严格禁止为了少改调用面而保留本地 facade、旧接口、兼容别名、反向依赖或临时适配层。必须让调用方一起迁移到目标接口；如果迁移范围变大，就说明真实改动范围本来就这么大，不能用局部包装掩盖。只有在用户明确要求分阶段迁移，或存在无法一次迁移的外部约束时，才允许保留迁移桥；迁移桥必须标注原因、边界和删除条件。

文档可能存在错误，请不要完全相信，只是作为参考

when you have any questions, see the [Conductor Instructions](.github/conductor-instructions.md).

when you coding, see the upstream architechture [`C:\Users\lanxi\Desktop\vscode` or `/Users/lance/Desktop/vscode`].



before you write or edit any code, you MUST first read the [Architecture Instructions](.github/instructions/architecture.instructions.md) and the [Coding Guidelines](.github/instructions/coding-guidelines.instructions.md).

when coding under a path with a matching `.github/instructions/*.instructions.md` file, read that instruction before editing code in that area.

when writing or editing naming, command/action ids, command handlers, action registration, contribution wiring, service calls, or responsibility boundaries, you MUST first read [Architecture Instructions](.github/instructions/architecture.instructions.md), [Commands and Dispatch](.github/instructions/commands.instructions.md), [Coding Guidelines](.github/instructions/coding-guidelines.instructions.md), and the matching module instruction such as [Files Capability / Explorer UI](.github/instructions/files.instructions.md). Do not infer these rules from memory.

when coding, prefer local modifications and existing structure; create new files only when the responsibility boundary is clear, reuse value is real, or keeping the change in the existing file would make it meaningfully worse.

when fixing a bug, do not make a local workaround first. Before editing, identify the root-cause chain from user symptom to triggering entry point, shared owner, and incorrect owner behavior. If the affected responsibility has an upstream VS Code counterpart, inspect `C:\Users\lanxi\Desktop\vscode` and state whether the fix follows or intentionally diverges from upstream. Only edit the owning service/component/primitive unless the local surface truly owns the behavior.

after each code update, check whether sequence diagrams in the matching module instructions need to be updated, and update them when the behavior or call flow changes.
