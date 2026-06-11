# Conductor Studio

[English](./README.md) | 中文

Conductor Studio 是一款面向半导体器件测试数据的桌面优先分析工具。它把成批的 CSV/Excel 原始测试文件整理成可提取的曲线、诊断图、计算参数，以及可以直接交给 Origin 继续出图的数据。

它适合实验室里反复出现的测试格式：先导入一批文件，告诉 Conductor Studio X/Y 数据、图例和标签在哪里，把这套规则保存成模板，后续同类实验就能直接复用。

## 文档入口

- [项目 Wiki](https://github.com/chogng/conductor/wiki)：架构、源码组织、迁移规则、Rust 执行分支、服务 ownership 和 agent 协作说明。
- [仓库说明](./.github/conductor-instructions.md)：本地编码规范和验证要求。
- [迁移规则](https://github.com/chogng/conductor/wiki/Migration-Rules)：在模块或服务之间迁移责任前应先阅读。

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

## 本地数据和临时文件

- 模板、设置以及已配置的 Origin 可执行文件路径等持久化数据，保存在
  Conductor Studio 的 user data 目录下。
- Origin 运行时任务文件属于敏感的临时中转数据。CSV 中间文件和 Origin
  worker 日志写入系统临时目录下的 `conductor/origin`，而不是持久化的
  user data 目录。
- 桌面应用会在启动时和正常退出时清理 Origin 运行时临时目录，以减少导出
  中间文件在磁盘上的停留时间，同时保留模板和设置。
- 如果系统崩溃或强制结束进程，退出时清理可能不会执行，所以启动时清理是
  这套隐私模型的一部分；如果以后调整运行时目录，也需要保留这层行为。

路径总览：

| 类型 | 默认位置 | 是否持久化 | 说明 |
| --- | --- | --- | --- |
| user data 根目录 | macOS: `~/Library/Application Support/Conductor Studio` | 持久化 | 可被 `CONDUCTOR_PORTABLE` 或 `--user-data-dir` 覆盖。 |
| 模板和设置 | `<userData>/User/` | 持久化 | 包含 `template.json`、`config.json` 和 `store-path.json`。 |
| Electron 运行时缓存 | `<userData>/Cache/` | 可重建 | 通过 `app.setPath("cache", ...)` 设置。 |
| Electron/V8 code cache | `<userData>/CachedData/<commit>/chrome/` | 可重建 | 桌面开发模式和 `--no-cached-data` 下不会启用。 |
| portable 模式下的日志 | `<userData>/logs/` | 持久化 | 只在 portable 模式启用时重定向到这里。 |
| 公共临时根目录 | `<temp>/conductor/` | 临时 | 基于 `app.getPath("temp")`；portable 模式下可通过 `<portable>/tmp` 一起重定向。 |
| Origin 运行时临时数据 | `<temp>/conductor/origin/` | 临时 | 用于 Origin 中转任务、CSV 中间文件、worker 日志和 stream jobs。 |
| Rust 处理临时数据 | `<temp>/conductor/rust-process-*` | 临时 | 单次处理请求的中间输出，例如 `calculation-cache.json`。 |
| Rust Excel 临时任务 | `<temp>/conductor/rust-xls-jobs/` | 临时 | 用于桌面端 Excel 转换任务。 |

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
./scripts/code.sh
```

Windows：

```bat
scripts\code.bat
```

该流程会：

1. 设置桌面开发环境变量
2. 构建并 watch Electron main/preload 代码
3. 启动 Vite 开发服务器
4. 启动 Electron，并在桌面输出变化时重启

共享编排逻辑在 `scripts/dev-desktop.ts`；`scripts/code.sh` 和
`scripts/code.bat` 是对齐上游命名的用户入口。职责划分和长期方向见
[项目 Wiki](https://github.com/chogng/conductor/wiki) 中的架构和责任边界说明。

旧的直接入口仍可使用：

```bash
npm run dev:desktop
```

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

如果需要 Vite 暴露给浏览器端的开关，可手动创建 `.env.local`。桌面
运行时变量则直接从启动进程的 shell 环境读取，而不是从 Vite env 文件读取。

```env
VITE_ANALYSIS_PERF=0

CONDUCTOR_UPDATE_URL=
CONDUCTOR_PORTABLE=
ORIGIN_EXE_PATH=
ORIGIN_PYTHON=
ORIGIN_CSV_WORKER_PATH=
CONDUCTOR_RUST_PROCESSING_POOL_SIZE=2
```

说明：

- `VITE_ANALYSIS_PERF=1` 会在浏览器端开启 analysis 性能日志。
- `CONDUCTOR_UPDATE_URL` 会在运行时覆盖打包应用的自动更新源。
- `CONDUCTOR_PORTABLE` 会把桌面端运行数据切到 portable 数据根目录；如果
  `<portable>/tmp` 存在，临时文件也会一起切过去。
- `ORIGIN_EXE_PATH` 和 `ORIGIN_PYTHON` 可用于本地桌面调试时覆盖 Origin
  可执行文件 / Python 的自动探测结果。
- `ORIGIN_CSV_WORKER_PATH` 主要用于开发模式下对构建后的 worker EXE 做冒烟测试。
- `CONDUCTOR_RUST_PROCESSING_POOL_SIZE` 可覆盖桌面端 Rust 处理池大小。

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

可重建的 npm/Python/Rust 构建缓存放在 `.build/cache/`；打包产物放在
`workers/`。

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
<userData>/User/template.json
<userData>/User/config.json
<userData>/User/store-path.json
```

`<userData>` 会按平台展开为：

```text
macOS:   ~/Library/Application Support/Conductor Studio
Windows: %APPDATA%\Conductor Studio
Linux:   ~/.config/Conductor Studio
```

在 macOS 上，`~/Library` 指的是当前用户主目录下的隐藏 `Library` 文件夹。

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

- `resources/win32/icon-2160.png`（桌面端生成资源的源图）
- `resources/win32/icon-*.png`（Windows 生成 PNG 变体，含桌面窗口图标 `icon-150.png`）
- `resources/win32/icon.ico`
- `resources/win32/header.bmp` 和 `resources/win32/sidebar.bmp`
- `resources/win32/appx/*.png`（Microsoft Store/AppX manifest 使用的磁贴和 logo 资源）
- `resources/darwin/icon.icns`
- `resources/linux/icon.png`

这些文件作为仓库内置的构建资源直接使用，可通过下面命令校验：

```bash
npm run verify:icons
```

## 代码签名

项目支持 `electron-builder` 的标准签名环境变量。

常用变量：

- macOS：`CSC_LINK`、`CSC_KEY_PASSWORD`，可选 `CSC_NAME`
- Windows：`WIN_CSC_LINK`、`WIN_CSC_KEY_PASSWORD`

## License

本项目采用 GNU Affero General Public License v3.0 only（`AGPL-3.0-only`）
授权。详见 [LICENSE.txt](./LICENSE.txt)。

本项目包含源自 Code - OSS / Visual Studio Code 的部分。保留的上游声明
见 [NOTICE.txt](./NOTICE.txt)。
