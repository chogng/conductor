上游1：C:\Users\lanxi\Desktop\code
上游2：C:\Users\lanxi\Desktop\codex
测试数据：C:\Users\lanxi\Desktop\293K

PowerShell 规则：
- 读写中文文本文件时显式指定 `-Encoding UTF8`。
- 文件路径优先使用 `-LiteralPath`，路径字符串用单引号包裹；需要拼接路径时优先用 `Join-Path`。
- 不把 Bash 语法直接搬到 PowerShell；避免 heredoc、`&&`、`||`、`$(...)`、反斜杠续行等容易混淆的写法。
- 复杂命令先拆成短命令验证；需要多步逻辑时使用清晰的 PowerShell 变量和原生命令。
- 递归删除或移动前，先解析并核对目标绝对路径确实位于预期工作区内。
