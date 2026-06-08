---
description: Architecture documentation for CS `
applyTo: 'src/cs/workbench/services/assessment/**'
---

AssessmentService 读取 RawTableRecord，产出 AssessmentRecord / RawTableAssessmentRecord。
它负责：
- 发现 block
- 识别 group/device/sample
- 识别 headerRange/dataRange/titleRange
- 识别 IV/CV/CF/PV/IT
- 识别 transfer/output
- 识别 column role
- 生成 confidence
- 生成 diagnostics


## 设计原则
services/assessment/common/measurement.ts
  放 RawMeasurementBlockRecord / MeasurementGroupRecord / ColumnMap / SweepMode

services/assessment/common/assessment.ts
  放 RawTableAssessmentRecord / AssessRawTableInput / IAssessmentService

services/assessment/browser/assessmentService.ts
  编排 assessment

services/assessment/browser/assessmentWasm.ts
  调 conductor-rs/assessment

旧的 fileAssessment.ts 可以迁移到 services/assessment/browser/assessmentService.ts。现在 fileConversion.ts 里直接调用 assessImportFile，说明 conversion 和 assessment 已经耦合了。
迁移后要断开：

fileConversion 只负责生成 RawTableRecord
assessmentService 负责判断 RawTableRecord