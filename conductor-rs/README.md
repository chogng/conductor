# conductor-rs 职责地图

这份文档记录当前 Rust 侧负责的范围，以及它和 Electron / workbench TypeScript 的边界。

## 当前定位

`conductor-rs` 目前有两个 workspace member：

- `assessment`：纯导入评估规则，native worker 和 browser WASM 共用。
- `worker`：产出 `rs-worker.exe`，由 Electron 主进程启动和管理。

Rust worker 有两种运行方式：

- 一次性 Excel 转换：`rs-worker.exe --convert-one <xls/xlsx> --out <csv> --manifest <json>`
- 常驻 stdio 引擎：`rs-worker.exe --stdio-worker`

桌面端通过 `src/cs/code/electron-main/app.ts` 和 `src/cs/code/electron-main/analysisRustMain.ts` 注册 IPC handler，再由 `src/cs/base/parts/sandbox/electron-browser/preload-import.ts` 暴露给 renderer。renderer 侧按职责从 `services/files`、`services/assessment`、`services/table`、`services/template`、`services/parameters` 调用，不再通过统一的 `analysisFile` 服务入口。

构建时 `scripts/build-rs-worker.ps1` 会把 Cargo target/cache 写到 `.build/cache/rs-worker-target/`，再把 release 产物复制到 `workers/rs/rs-worker.exe`。打包时 `package.json` 会把 `workers/rs` 放进应用资源。browser 侧的导入评估 WASM 使用 `.build/cache/rs-wasm-target/` 作为 Cargo target/cache，并由 `scripts/build-rs-assessment-wasm.ps1` 生成到 `src/cs/workbench/services/assessment/browser/assessment.wasm`。

## 已经由 Rust 负责的部分

### 1. Excel 转 CSV

入口：

- Electron IPC：`excel:convert-rust`
- 导入准备 IPC：`import:prepare-rust`
- Rust CLI：`--convert-one`

职责：

- 读取 `.xls` / `.xlsx` 的第一个 sheet。
- 跳过全空行。
- 流式写出 CSV，避免把完整 CSV 文本长期压在 JS 内存里。
- 生成 manifest：行数、单元格数、数值单元格数、CSV 字节数、耗时等。
- 生成导入评估 `assessment`，包括曲线类型、置信度、是否需要模板、X 轴角色等。

前端/桌面边界：

- renderer 侧转换入口在 `src/cs/workbench/services/files/browser/fileConverter.ts`，Explorer 导入编排在 `src/cs/workbench/contrib/files/browser/explorerImportPipeline.ts`。
- Electron renderer 实现是 `src/cs/workbench/services/files/electron-browser/fileConverterBackendService.ts`。
- Electron main handler 在 `src/cs/code/electron-main/app.ts`。
- 如果请求 `returnCsvText=false`，桌面端会保留转换后的 CSV 临时路径，后续可通过 `readConvertedCsv` 读取。

### 2. CSV 数据集打开与缓存

入口：

- stdio command：`open`
- Electron IPC：`rust:open`

职责：

- 支持 `.csv` 输入。
- 读取为 `EngineDataset`。
- 维护每个 `fileId` 对应的数据集缓存。
- 计算 `rowCount`、`columnCount`、每列最大文本长度、首批 seed rows。
- 按列懒加载数值缓存，供后续提取和分析复用。

编码：

- CSV 默认按 UTF-8 读取。
- 如果 UTF-8 解码失败，会使用 GB18030 兜底解码，再进入同一套 CSV parser。
- 这个兜底在 `worker/src/dataset.rs`，因此 `open`、`previewRows`、`assessImport` 共用。

边界：

- 缓存在 Rust worker 进程内，`dispose` / `clear` 会释放。
- Excel 文件不会直接进入 `open`；导入准备阶段会先转换成 CSV。

### 3. 导入评估

入口：

- stdio command：`assessImport`
- Electron IPC：`import:prepare-rust`

职责：

- 对 CSV 读取预览数据并生成导入评估。
- 对 Excel 先走 Rust Excel 转 CSV，再从 manifest 中取得评估。
- 返回 `curveType`、`curveTypeConfidence`、`curveTypeNeedsTemplate`、`xAxisRole`、`xAxisRoleSource`。

renderer 使用：

- `src/cs/workbench/services/files/browser/pendingImportFiles.ts`：导入门禁。
- `src/cs/workbench/services/files/browser/fileConverter.ts`：调用 Rust prepare 并生成 raw table import payload。
- `src/cs/workbench/contrib/files/browser/explorerImportPipeline.ts`：组装 Explorer/files workflow 消费的数据。

### 4. 大表预览和按需读单元格

入口：

- stdio commands：`previewRows`、`previewMeta`、`readCell`、`readCells`
- Electron IPC：`rust:preview-meta`、`rust:preview-rows`、`rust:read-cell`、`rust:read-cells`

职责：

- 返回指定行区间，供虚拟表格滚动加载。
- 返回单个或批量单元格。
- 单元格结果同时包含原始文本 `value` 和严格解析的 `numberValue`。

前端使用：

- `src/cs/workbench/contrib/table/browser/tableService.ts`
- `src/cs/workbench/contrib/table/browser/rows/rustCells.ts`

### 5. 自动提取推断

入口：

- stdio command：`inferAutoExtraction`
- 内部 command：`inferAutoWorkerConfig`

职责：

- 从文件名、表头、metadata、仪器导出的 Notes/Channel 信息里推断曲线类型。
- 识别 transfer/output 及 PV/CV/CF 等非 IV 数据。
- 推断 X 轴列、Y 列、数据起始行、分组大小、组数。
- 支持从 metadata 读取 `Dimension1`、`Dimension2`、`Measurement.Secondary.Count`。
- 在 metadata 不完整时，通过 X 值重复形态推断自动分段。
- 为处理阶段生成可执行的 extraction config。

兼容验证：

- `npm run verify:rust-auto-extraction`

### 6. 文件处理和曲线数据抽取

入口：

- stdio commands：`processFile`、`processFileAuto`
- Electron IPC：`rust:process-file`

职责：

- 按 extraction config 抽取 X/Y series。
- 支持 `xSegmentationMode` 为 `auto`、`points`、`segments`。
- 支持多个 Y 列。
- 支持按文件名字段筛选曲线。
- 生成绘图所需的 series、legend、domain、labels、单位等结果。
- 可把分析缓存写到临时 JSON 文件，由 Electron 再 hydrate 回 JS 对象，减少 IPC 大对象传输压力。

当前限制：

- Electron 侧只允许 `yCols` 非空，且 `xSegmentationMode` 只能是空/`auto`/`points`/`segments` 的 config 进入 Rust。
- 不支持的 config 会返回 `RUST_ENGINE_PROCESS_UNSUPPORTED_CONFIG`，前端继续使用 TypeScript 路径。

兼容验证：

- `npm run verify:rust-ss-auto`
- `npm run bench:phase3`

### 7. 派生分析缓存

入口：

- stdio command：`analyzeSeriesBatch`
- Rust 内部在 `processFile` 时也会生成相关分析缓存。

职责：

- 计算 `gm`：中心差分。
- 计算 `ss`：基于 log10(abs(I)) 的亚阈值摆幅曲线。
- 计算 `ssFitAuto`：自动寻找 SS 拟合窗口，返回 strict/suggested 两套结果。
- 计算 transfer-like 曲线的基础电流指标：`ioff`、`ion`、`ionIoff`、对应窗口和候选窗口。
- 支持双向扫描分支拆分，避免在回扫拐点处把导数/SS 算串。
- 批量 series 数量较多时使用 Rust 多线程并行。

版本：

- `analysis.rs` 里的 `ANALYSIS_CACHE_VERSION` 当前为 `2`。

### 8. Rc 分析

入口：

- stdio command：`analyzeRc`
- Electron IPC：`rust:analyze-rc`

职责：

- 读取多器件的 L/W/Vds 和 X/Y 曲线。
- 对重复 X 做合并。
- 在各器件共同 VG domain 上插值。
- 根据电流阈值过滤点。
- 对总电阻与沟道长度做线性拟合。
- 输出 `rc`、`rcw`、`rSheet`、intercept、slope、R2、每个 VG 的 fit points 和 warning。
- 支持按宽度归一化。

版本：

- `rc.rs` 里的 `RC_ANALYSIS_VERSION` 当前为 `1`。

### 9. Origin CSV 导出加速

入口：

- stdio command：`exportOriginCsv`
- Electron IPC：`rust:export-origin-csv`

职责：

- 对单文件或多 source 的 Origin CSV 导出做流式写文件。
- 支持从原始数据按 config 重新抽取后导出，减少前端传大块 CSV 文本。
- 支持 `xScaleFactor`、`yScaleFactor`、`yTransform`。
- 支持普通曲线导出列计划。
- 支持 output/transfer metrics CSV 导出，其中 transfer 会复用 Rust 的基础电流、gm、SS、Vth 相关计算。

当前限制：

- Electron 侧要求 extraction config 仍满足 Rust process 支持范围。
- 导出计划里必须有 columns，或者是 `metricKind=output|transfer` 且提供 `metricSeries`。
- 不支持的导出计划会返回 `RUST_ENGINE_EXPORT_UNSUPPORTED_CONFIG`，前端保留原 TS 文本导出路径。

兼容验证：

- `npm run verify:rust-origin-export`

## Rust 模块分工

- `assessment/src/lib.rs`：导入评估 source of truth，包含 metadata 提取、曲线类型判断、X 轴角色判断和 WASM JSON adapter。
- `worker/src/main.rs`：命令解析、stdio 协议、Excel 转换、自动提取主逻辑、文件处理、Origin CSV 导出。
- `worker/src/dataset.rs`：CSV 读取、编码兜底、`EngineDataset`、预览元信息、按列数值缓存。
- `worker/src/converter.rs`：Excel 读取和 CSV 写出。
- `worker/src/import.rs`：转调 `assessment` crate 构造导入 assessment。
- `worker/src/detect.rs`：曲线类型、metadata、表头和形态识别。
- `worker/src/analysis.rs`：gm、SS、自动 SS fit、基础电流指标、分析批处理。
- `worker/src/rc.rs`：Rc/TLM 分析。
- `worker/src/infer.rs`：metadata 分组推断、X 值重复分段推断、正整数 metadata 解析。
- `worker/src/legend.rs`：legend label 解析和生成。
- `worker/src/cells.rs`：批量读单元格请求类型。
- `worker/src/utils.rs`：JSON/config 取值、数值解析、header/file-name 归一化、单位拼接等工具。

## 仍主要在 TypeScript / Python 侧的部分

### 前端交互和状态

- 文件选择、队列调度、模板 UI、预览表格 UI、图表 UI、设置、session/cache policy 仍在 TypeScript DOM/UI 层。
- Rust 只返回数据结构，不负责 UI 状态、交互、canvas 绘图。

### 兼容和回退实现

- 自动提取、曲线分类、处理、分析、导出仍有 TS 版本作为兼容基准和 fallback。
- 相关 TS 测试仍是迁移时的行为锚点，例如：
  - `src/cs/workbench/services/assessment/test/browser/importFileAssessment.test.ts`
  - `src/cs/workbench/services/assessment/test/common/fileAssessment.test.ts`
  - `src/cs/workbench/services/table/test/browser/tableService.test.ts`
  - `src/cs/workbench/contrib/diagnostics/common/analysisMath.test.ts`
  - `src/cs/workbench/contrib/export/browser/export.test.ts`

### Origin COM 操作

- Origin 软件自动化仍在 Python worker / Origin runner。
- Rust 目前只负责给 Origin 准备 CSV 文件或 metrics CSV，不负责打开 Origin、建图、调轴、设样式、导出图片。

### Electron 壳和进程管理

- worker 路径查找、进程池、超时、临时目录、IPC 参数校验都在 Electron main。
- Rust worker 不直接接触 Electron API。

## 迁移候选建议

### 优先级高

1. 继续扩大 Rust assessment 覆盖面

导入评估规则已经收敛到 Rust `assessment` crate：

- native `worker` 直接依赖 `assessment` crate。
- browser 侧使用同一个 crate 编译出的 `assessment.wasm`。
- `fileAssessment.ts` 只保留 File/CSV preview adapter，不再持有评估规则。

之前用于迁移确认的 TS/Rust A/B verifier 已经删除；后续不要再维护两套导入评估规则。需要扩大识别能力时，直接改 Rust `assessment` crate，并用 browser import assessment 测试覆盖。

2. 补齐更多 extraction config 支持

当前 Rust 处理入口已经稳定，继续迁移最顺。可以优先看 TS 里仍被 Rust 支持判断拦住的模板能力，例如更复杂的分段、列选择、legend、筛选或特殊表格布局。

3. 把 TS 分析缓存生成路径进一步收敛到 Rust

`analysis.rs` 已经覆盖 gm/SS/SS fit/base current。接下来适合迁移仍留在 TS 的派生指标、指标 CSV 组装前的数值计算，减少前端处理大 series 的 CPU 压力。

4. 扩大 Origin CSV 导出覆盖面

Rust 已经能流式写普通曲线和 output/transfer metrics。下一步可以迁移更多导出 plan 形态，让前端少传 CSV 文本，尤其是多文件合并、派生曲线、特殊 metrics。

### 优先级中

5. 曲线分类/自动模板推断完全对齐 TS

Rust 已经有 metadata/file-name/shape 推断，但 TS 侧仍是兼容基准。适合逐步把差异收敛，并把测试数据扩到更多仪器格式。

6. 预览层更多计算下沉

当前 Rust 负责读取行/单元格。若后续预览需要搜索、筛选、统计、列类型推断，可直接在 `EngineDataset` 上做，避免把整表拉回 JS。

7. 文件名字段匹配能力下沉

Rust 已经有 file-name pattern matching 工具。可以继续迁移 TS 里的批量字段解析、器件标签解析、筛选规则，让处理和导出共用同一套逻辑。

### 暂不建议优先迁移

8. TypeScript UI 状态和图表绘制

这部分收益不如数据处理高，而且会引入 UI/wasm/原生桥接复杂度。保持 TypeScript 更自然。

9. Origin COM 自动化

当前 Python/Origin runner 负责 Origin 自动化更合适。除非要替换整个 Origin 自动化栈，否则 Rust 只负责生成输入文件更稳。

## 判断下一块是否适合迁到 Rust

适合迁移的特征：

- 输入是文件路径、config、series 数组、数值数组。
- 输出是纯 JSON 或临时文件。
- CPU/内存压力明显，或涉及大文件/多文件。
- 行为能用现有 TS 测试和 fixture 做兼容对比。
- 不依赖 UI 状态、DOM、canvas、Electron API 或 Origin COM。

不太适合优先迁移的特征：

- 主要是 UI 交互和用户操作编排。
- 强依赖浏览器布局、canvas 绘制、剪贴板、下载等 Web API。
- 强依赖 Origin COM 或 Windows GUI 自动化。

## 常用命令

```powershell
npm run build:rs-worker
npm run verify:rs-worker-artifacts
npm run verify:rust-auto-extraction
npm run verify:rust-ss-auto
npm run verify:rust-origin-export
npm run bench:phase3
```

直接构建 Rust crate：

```powershell
Set-Location -LiteralPath 'C:\Users\lanxi\Desktop\conductor\conductor-rs'
cargo build --release -p worker
```

构建并复制到桌面应用资源目录：

```powershell
Set-Location -LiteralPath 'C:\Users\lanxi\Desktop\conductor'
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\build-rs-worker.ps1
```

直接启动 stdio worker 调试：

```powershell
Set-Location -LiteralPath 'C:\Users\lanxi\Desktop\conductor\conductor-rs'
cargo run --release -p worker -- --stdio-worker
```

压测 CSV open / preview：

```powershell
Set-Location -LiteralPath 'C:\Users\lanxi\Desktop\conductor'
node scripts\bench-rs-worker-preview.mjs 'C:\Users\lanxi\Desktop\293K'
```

压测 Excel sidecar 转换：

```powershell
Set-Location -LiteralPath 'C:\Users\lanxi\Desktop\conductor'
node scripts\bench-rs-worker-xls-sidecar.mjs 'C:\Users\lanxi\Desktop\293K'
```
