# Conductor Studio

[English](./README.md) | 中文

Conductor Studio 是一款面向半导体器件测试数据的桌面优先分析工具。它把成批的 CSV/Excel 原始测试文件整理成可提取的曲线、诊断图、计算参数，以及可以直接交给 Origin 继续出图的数据。

它适合实验室里反复出现的测试格式：先导入一批文件，告诉 Conductor Studio X/Y 数据、图例和标签在哪里，把这套规则保存成模板，后续同类实验就能直接复用。

## 它解决什么问题

- **批量导入器件测试数据**：导入 CSV 和 Excel 文件，预览大表格，把一组实验文件放在同一个工作区里处理，而不是逐个文件手工整理。
- **复用提取模板**：配置 X 范围、曲线分段、Y 列、图例、单位、曲线类型提示和文件名匹配规则，用一套模板处理重复的测试版式。
- **能自动就自动，不能自动就手动**：对支持的文件自动推断列、分组和 transfer/output 等曲线角色；遇到真实数据里的混乱格式时，仍然可以回到手动模板。
- **支持 block 感知的自动版式**：当一个 CSV/XLSX 里横向合并了多个独立的 `X + Y...` 数据块时，先识别每个 block，再用各自的 X 列提取，同时兼容旧的单 block 自动逻辑。
- **集中检查曲线和参数**：在分析工作区里对比多文件结果，查看缩略图、主图、计算参数、gm 诊断、SS 诊断和 Ion/Ioff 汇总。
- **对接 Origin 出图**：把选中的曲线直接发送到 Origin，支持合并列、新工作表、新工作簿和独立窗口；自动打开不可用时，也可以回退为 ZIP 导出。
- **支撑大文件处理**：桌面端通过 Rust sidecar 加速 Excel 转换、预览、提取、处理和批量分析，同时保留 TypeScript 兼容回退路径。

## 核心流程

1. 导入原始测试文件。
2. 预览其中一个文件，选择 `Auto` 或配置已保存的提取模板。
3. 将提取规则应用到单个文件、新增文件或整批文件。
4. 在分析工作区检查曲线和计算参数。
5. 导出 CSV/ZIP 结果，或把选中的曲线直接打开到 Origin。

## 桌面端能力

- Electron 桌面运行时，适合离线 Windows 实验室电脑。
- 本地持久化保存模板、应用设置、Origin 路径设置和自定义存储位置。
- 打包版本内置 Rust Excel converter 和 Python Origin CSV worker。
- 支持 Electron Builder 打包、Windows 发布产物和自动更新。

## 环境要求

- Node.js 22+
- npm 10+
- 构建和测试 Origin CSV worker 需要 Windows

## 快速开始

安装依赖：

```bash
npm install
```

启动 Web 应用：

```bash
npm run dev
```

默认 Vite 地址：

```text
http://localhost:5173
```

## 桌面端开发

启动 Electron 开发模式：

```bash
npm run dev:desktop
```

该流程会：

1. 使用 `npm run build:desktop:core` 构建 Electron main/preload 代码
2. 启动 Vite 开发服务器
3. 启动 Electron 应用

常用脚本：

- `npm run build:desktop:core`：只构建 Electron main/preload
- `npm run build:web:desktop`：构建桌面端使用的 Web bundle
- `npm run build:desktop`：构建 Origin CSV worker、Rust Excel converter、Electron main/preload 代码和桌面端 Web bundle

## 常用脚本

质量检查：

```bash
npm run lint
npm run typecheck
npm run test:unit
```

构建和打包：

- `npm run build`：构建 Web 应用
- `npm run pack:desktop`：构建并生成无安装器的桌面端输出
- `npm run dist:desktop`：构建桌面端安装包/发布产物
- `npm run pack:desktop:oneclick`：一键生成桌面端目录包
- `npm run dist:desktop:oneclick`：一键生成桌面端安装包

发布和验证：

- `npm run verify:auto-update-config`：验证自动更新配置
- `npm run build:py-worker`：构建 Python Origin worker EXE
- `npm run verify:py-worker`：验证 Python worker EXE 及其嵌入版本信息
- `npm run dist:desktop:publish`：本地桌面端发布流程
- `npm run release:desktop:local`：显式本地发布入口

打包提示：

- 在 Windows 上，`npm run build:desktop`、`npm run pack:desktop` 和 `npm run dist:desktop` 会在 Electron Builder 打包前自动构建 Python Origin CSV worker 和 Rust Excel converter。
- 如果刚清理过工作区，请先运行 `npm install`，因为构建脚本需要 `node_modules/`。

## 环境变量

需要时将 `.env.example` 复制为 `.env.local`。

```env
VITE_WS_URL=
VITE_ORIGINBRIDGE_API_BASE_URL=
VITE_DA_PREVIEW_CANVAS=0
CONDUCTOR_UPDATE_URL=
```

说明：

- `VITE_ORIGINBRIDGE_API_BASE_URL` 主要用于本地 OriginBridge 集成。
- `CONDUCTOR_UPDATE_URL` 会在运行时覆盖打包应用的自动更新源。

## 桌面端产物

桌面端输出目录：

```text
release/
```

Windows 命名：

- Store package：`Conductor-Studio-${version}-windows-${arch}-store.appx`
- 安装器：`Conductor-Studio-${version}-windows-${arch}-setup.exe`
- 便携 zip：`Conductor-Studio-${version}-windows-${arch}-portable.zip`
- 便携 7z：`Conductor-Studio-${version}-windows-${arch}-portable.7z`

其他平台使用：

```text
${productName}-${version}-${os}-${arch}.${ext}
```

## Origin Worker

桌面应用内置一个离线 worker：

- `workers/py/origin-csv-worker/origin-csv-worker.exe`

默认本地 worker 虚拟环境：

```text
.venv-py-workers/
```

构建 worker：

```powershell
npm run build:py-worker
```

验证 worker：

```powershell
npm run verify:py-worker
```

查看嵌入的 worker 元数据：

```powershell
workers/py/origin-csv-worker/origin-csv-worker.exe --worker-version
```

运行行为：

- 开发模式默认使用 `conductor-py/run_origin_csv.py`
- 可通过 `ORIGIN_CSV_WORKER_PATH` 指定 EXE 路径进行冒烟测试
- 打包后的桌面版使用内置 worker EXE

更多说明：[conductor-py/ORIGIN_WORKERS.md](./conductor-py/ORIGIN_WORKERS.md)

## Device Analysis Origin 导出模式

`Open in Origin` 当前支持四种模式：

- `merged`（`New columns`）：将导出的曲线追加到同一个工作表
- `workbookSheets`（`New worksheet`）：在同一个工作簿中创建新工作表
- `workbookBooks`（`New workbook`）：在同一个 Origin 窗口/会话中创建多个工作簿
- `separate`（`New window`）：每个导出项通过独立 Origin 窗口/会话路径打开

## Device Analysis 图表自动范围

应用内图表自动范围遵循类似 Origin 的策略：

- 自动范围和主刻度会一起选择。
- 坐标轴端点会贴合可读的主刻度边界，而不是只对原始数据最小/最大值做 padding。
- 线性坐标轴使用 nice step 和贴合后的端点。
- 对数坐标轴使用 decade 主刻度；如果数据接近 decade 边界，自动范围会扩展到外侧 decade，避免曲线贴到图框边缘。
- 手动 min/max 输入保持严格，不会被扩展，除非需要从无效对数坐标值中恢复。

相关代码：

- `src/cs/workbench/contrib/chartPreview/lib/analysisChartsUtils.ts`
  - `buildOriginAutoTicks`
  - `buildOriginLogAutoTicks`
  - `padLinearDomain`
  - `padLogDomain`
- `src/cs/workbench/contrib/chartPreview/browser/analysisCharts.ts`
  - `xDomain`
  - `yDomain`
  - `xTicks`
  - `yTicks`

## 桌面端持久化

桌面端会分开保存模板和设置：

- `template.json`
- `config.json`
- `store-path.json`

默认位置：

```text
~/.device/template.json
~/.device/config.json
~/.device/store-path.json
```

如果使用自定义配置路径，例如 `D:\DeviceAnalysis\config.json`，相关文件会保存在同一目录下。

## 自动更新

Windows 桌面版支持 `electron-updater`。

启动后会先检查更新，之后每 4 小时检查一次；下载在后台完成，准备好后提示重启安装。

推荐发布流程：

1. 更新 `package.json.version`
2. 推送匹配的代码和 tag，通常为 `v<version>`
3. 确保 `gh` 或 `GH_TOKEN` 具备 release 上传权限
4. 运行 `npm run dist:desktop:publish`
5. 确认 release 中包含 `latest.yml`、安装器和对应的 blockmap 文件

本地发布流程会把桌面端产物构建到 `release/`，创建或更新 GitHub Release，并只上传 updater 需要的文件：`latest.yml`、安装器和对应的 `.blockmap`。

GitHub Actions 发布会走同样的 tag 流程，并把完整的 `release/` 目录镜像到源仓库 release 里，便于追溯。

## Microsoft Store

首选的 Windows 分发路径是 Microsoft Store AppX/MSIX：

```powershell
npm run dist:desktop:store
```

这个命令会生成一个包含 Electron 应用、Rust Excel converter 和 Origin CSV worker 的包。Store 提交由 Microsoft 完成最终签名，因此这条路径不需要单独的付费代码签名证书。

Store 包会直接从已安装的应用资源中解析 sidecar 可执行文件，运行在 Store 模式时不会走 GitHub updater 路径。

保留传统 EXE 路径用于非 Store 分发：

```powershell
npm run dist:desktop:exe
```

首次提交 Store 之前，先在 Partner Center 里保留应用名，并把分配到的 package identity 值填到 `package.json` 的 `build.appx` 中。

## 图标

项目图标：

- `build/icons/icon.png`
- `build/icons/icon.icns`
- `build/icons/icon.ico`
- `build/appx/*.png`（Microsoft Store/AppX manifest 使用的磁贴和 logo 资源）

这些文件作为仓库内置的构建资源直接使用，可通过下面命令校验：

```bash
npm run verify:icons
```

## 代码签名

项目支持 `electron-builder` 的标准签名环境变量。

常用变量：

- macOS：`CSC_LINK`、`CSC_KEY_PASSWORD`，可选 `CSC_NAME`
- Windows：`WIN_CSC_LINK`、`WIN_CSC_KEY_PASSWORD`
