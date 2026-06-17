# Rust CLI 职责地图

这份文档记录 `conductor-rs` 当前负责的桌面数据平面，以及它和
Electron / workbench TypeScript 的边界。Rust 负责重活，TypeScript
仍负责产品状态、服务编排、Session commit 和 UI。

## 运行方式

Rust workspace 的主要运行产物：

- `cli`：构建 `conductor-rs` / `conductor-rs.exe`，由 Electron main 管理。
- `extensions/xlsx`：browser 侧 Excel WASM 转换入口。

`conductor-rs` 有两种桌面运行方式：

- 一次性 Excel 转换：`conductor-rs --convert-one <xls/xlsx> --out <csv> --manifest <json>`
- 常驻 stdio worker：`conductor-rs --stdio-worker`

构建入口：

```sh
npm run build:conductor-rs
```

构建脚本会编译 Cargo workspace 中的 `conductor-cli`，并把 release
产物复制到 `resources/bin/conductor-rs` 或 `resources/bin/conductor-rs.exe`。
桌面打包会把 `resources/bin` 放入应用资源。

## Runtime 边界

桌面链路：

```txt
workbench service / Explorer workflow
  -> electron-browser service implementation
  -> preload IPC method
  -> Electron main handler
  -> conductor-rs --stdio-worker
  -> Electron main normalizes result
  -> service converts to domain records
  -> Session / Explorer / Table / Assessment consume normal state
```

Rust CLI 不直接接触 Electron API、SessionModel、Explorer state、DOM、
canvas、Origin COM 或用户通知。workbench 代码也不应依赖具体可执行文件名；
只有 Electron main 的 resolver 知道 `conductor-rs` 的位置。

## 当前 Rust 职责

### Excel 转 CSV

入口：

- one-shot CLI：`--convert-one`
- stdio / desktop prepare：Excel import prepare path

职责：

- 读取 `.xls` / `.xlsx` 的第一个 worksheet。
- 跳过全空行并流式写出 normalized CSV。
- 生成 manifest：行数、单元格数、数值单元格数、CSV 字节数和耗时。
- 给桌面导入返回 normalized CSV path，而不是把大 CSV 文本传回 JS。

当前限制：Rust 和 WASM Excel converter 仍只导出第一个 worksheet。多 sheet
fixture 现在用于压测格式混合和错误路径，不代表已经支持多 sheet import。

### CSV 数据集和预览

入口：

- stdio commands：`open`、`previewRows`、`previewMeta`、`readCell`、`readCells`

职责：

- 打开 `.csv` 为 `EngineDataset` 并按 `fileId` 缓存在 Rust worker 内。
- 提供 bounded rows/cells 读取，避免把整表拉回 renderer。
- 维护 row/column metadata、最大 cell length、按列数值缓存。

编码策略：

- 优先 UTF-8。
- UTF-8 失败时用 GB18030 兜底。
- 二进制、乱码、空文件会进入 health/failure 路径，不应污染正常 rows。

### 导入评估和 badge prepare

入口：

- stdio commands：`assessImport`、`assessImportBatch`
- Electron main：file conversion prepare / stream prepare

职责：

- 为 CSV 直接读取 summary：`rowCount`、`columnCount`、`maxCellLengths`、
  bounded preview rows 和 health。
- 用 summary 构建 import assessment，不为 badge prepare 构建完整
  `EngineDataset.rows`。
- 为 batch prepare 返回每个文件独立的 ok/failure、duration、health 和 assessment。
- 对空文件、乱码、二进制伪装 CSV 返回 health，不让坏文件阻塞整批。

桌面优化机制：

- Electron main 先 stat path，缓存 key 为 normalized path + size + mtime。
- cache hit 返回 cloned prepare descriptor，并标记 `cacheHit` 供 trace 使用。
- app ready 后预热 Rust processing pool，减少首批 worker 启动成本。
- folder import 使用较大的 stat batch，但 Rust prepare 结果保持小 chunk
  回流。当前默认大批量 CSV prepare 是 `2 files / Rust command`，Rust batch
  内部并行度为 `1`，这个配置优先 badge latency，而不是单次 batch 吞吐。
- renderer/main IPC 可以 stream per-file result；Explorer 在文件准备完成后
  尽快投影 assessment badge。

### 自动提取、处理和分析

入口：

- stdio commands：`inferAutoExtraction`、`processFile`、`processFileAuto`、
  `analyzeSeriesBatch`

职责：

- 从文件名、metadata、表头和 X 值形态推断 curve type、X/Y 列、
  data start、group size、segment shape。
- 按 extraction config 抽取 series、legend、domain、labels 和单位。
- 计算 gm、SS、自动 SS fit、Ion/Ioff 等派生指标。
- 大结果优先写临时 JSON artifact，由 Electron hydrate，减少 IPC 大对象。

### Rc/TLM 计算

入口：

- stdio command：`calculateRc`

职责：

- 合并重复 X、插值共同 VG domain、按阈值过滤、线性拟合总电阻与沟道长度。
- 输出 `rc`、`rcw`、`rSheet`、slope、intercept、R2、fit points 和 warnings。

### Origin CSV 导出

入口：

- stdio command：`exportOriginCsv`

职责：

- 流式写普通曲线 CSV 或 output/transfer metrics CSV。
- 支持从原始数据按 config 重新抽取后导出。
- 支持 `xScaleFactor`、`yScaleFactor`、`yTransform`。

## 模块分工

- `cli/src/main.rs`：stdio protocol、command dispatch、batch import prepare、
  Excel one-shot、处理/导出主入口。
- `cli/src/dataset.rs`：CSV decode、health、summary parser、`EngineDataset`、
  preview/cell reads、数值缓存。
- `cli/src/assessment.rs` / `cli/src/detect.rs`：导入评估、curve type、metadata、
  表头和形态识别。
- `cli/src/converter.rs`：Excel 读取和 normalized CSV 写出。
- `cli/src/import.rs`：import assessment adapter。
- `cli/src/infer.rs`：metadata 分组和 X 值重复形态推断。
- `cli/src/analysis.rs`：gm、SS、SS fit、基础电流指标。
- `cli/src/rc.rs`：Rc/TLM 分析。
- `cli/src/legend.rs`：legend label 解析和生成。
- `cli/src/cells.rs`：批量 cell request 类型。
- `cli/src/utils.rs`：JSON/config 取值、数值解析、归一化和单位工具。
- `extensions/xlsx/src/lib.rs`：browser Excel WASM 转换入口。

## 测试和压测

基础验证：

```sh
npm run build:conductor-rs
npm run build:desktop:core
npm run verify:rust-assessment-parity
npm run verify:rust-auto-extraction
npm run verify:rust-ss-auto
npm run verify:rust-origin-export
```

导入 badge 性能压测：

```sh
npm run test:import-badge-trace -- --runtime=desktop --auto-folder --files=200 --rows=4000
npm run test:import-badge-trace -- --runtime=desktop --auto-folder --files=200 --rows=4000 --profile=mixed
npm run test:import-badge-trace -- --runtime=browser --auto-browser --files=200 --rows=4000
npm run test:import-badge-trace -- --runtime=browser --auto-browser --files=200 --rows=4000 --profile=mixed
```

报告输出到：

```txt
.build/bench/import-badge-trace/*.json
```

`healthy` profile 生成 200 个内容不同的 CSV。`mixed` profile 额外覆盖：

- schema variant CSV；
- garbled CSV；
- binary-like CSV；
- empty CSV；
- corrupt XLSX；
- multi-sheet XLSX fixture。

报告里重点看：

- first / half / all assessment badge；
- first / half / all prepare complete；
- backend invoke wall time；
- Rust per-file p50 / p95；
- materialize / append cost；
- health state 和 failure code；
- renderer long task、event loop lag、RSS、JS heap。

browser 压测为了避免 Playwright 一次性传 200 个大文件造成协议噪音，会在
page 内按 seed 生成不同内容的 `File` 对象，再派发 drop event。desktop 压测
走真实 folder path 和 native filesystem metadata。

## 迁移判断

适合继续下沉到 Rust 的工作：

- 输入是文件路径、config、series 或数值数组；
- 输出是 JSON descriptor、bounded preview 或临时 artifact path；
- CPU/内存压力明显；
- 能用 TS/Rust parity 或 bench fixture 验证。

不优先下沉到 Rust 的工作：

- UI 状态、DOM、canvas、命令注册、Explorer selection；
- Session mutation；
- Origin COM 自动化；
- 只影响交互编排、不处理大数据的逻辑。
