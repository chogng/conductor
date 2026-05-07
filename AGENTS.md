上游1：C:\Users\lanxi\Desktop\code
上游2：C:\Users\lanxi\Desktop\codex
测试数据：C:\Users\lanxi\Desktop\293K

PowerShell 规则：
- 读写中文文本文件时显式指定 `-Encoding UTF8`。
- 文件路径优先使用 `-LiteralPath`，路径字符串用单引号包裹；需要拼接路径时优先用 `Join-Path`。
- 不把 Bash 语法直接搬到 PowerShell；避免 heredoc、`&&`、`||`、`$(...)`、反斜杠续行等容易混淆的写法。
- 复杂命令先拆成短命令验证；需要多步逻辑时使用清晰的 PowerShell 变量和原生命令。
- 递归删除或移动前，先解析并核对目标绝对路径确实位于预期工作区内。

前端基础 UI 规则：
- `src/cs/base/browser/ui` 下的组件按上游风格组织为“组件目录 + 同名实现文件”，不要再添加 `index.ts` 入口文件。
- 导入项目内文件时优先使用从 `src/` 开始的完整路径，例如 `src/cs/base/browser/ui/Button/Button`；不要使用多层 `../../../` 形式。
- UI 组件的样式优先跟随上游的 CSS-first 思路：结构只表达语义和必要交互，纯视觉层级、装饰、状态呈现优先放进 CSS，用类名、属性选择器、伪元素等承接。
- 不为了样式效果手写额外 DOM；确实需要 DOM 的场景必须是语义、可访问性、交互或测量布局需要。
