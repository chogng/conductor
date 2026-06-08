---
description: Architecture documentation for the Table service. Use when working in `src/cs/workbench/services/table`
applyTo: 'src/cs/workbench/services/table/**'
---

## Table Service

TableService 负责 raw table preview、block table preview、column display、分页读取。
它可以读取 RawTableRecord.rows。
它可以利用 maxCellLengths 估算列宽。
它不负责识别 block。
它不负责生成 assessment。