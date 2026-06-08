---
description: Architecture documentation for the Template service. Use when working in `src/cs/workbench/services/template`
applyTo: 'src/cs/workbench/services/template/**'
---

# TemplateService

TemplateService 负责 template 管理和应用。
它不负责判断数据是否像 IV/CV。
它读取 assessment result / measurement blocks。
它可以产出 TemplateRunRecord。
它可以请求 SessionService commit template result。

# TemplateApplyService

