# conductor

`conductor` 是一个器件分析应用，支持 Web 与 Electron 桌面端（Windows 自动更新）两种运行形态。

## 功能概览

- CSV 批量导入与预览
- 模板管理
- 数据提取与异常提示
- 图表分析与导出
- Origin CSV Worker 离线处理
- Windows 桌面端自动更新

## 环境要求

- Node.js 22+（推荐与 CI 一致）
- npm 10+
- Windows 下构建 Origin Worker 需要 PowerShell（Python 3.11 由脚本自动处理）

## 快速开始

安装依赖：

```bash
npm install
```

启动 Web 开发：

```bash
npm run dev
```

默认地址：

```text
http://localhost:5173
```

## 本地开发（Desktop）

启动桌面联调：

```bash
npm run dev:desktop
```

`dev:desktop` 会自动执行以下流程：

1. 编译 Electron 主进程/预加载脚本（`build:desktop:core`）
2. 启动 Vite 开发服务
3. 启动 Electron 窗口并监听 `desktop-dist/` 变更自动重启
4. 关闭 Electron 后，开发进程一并退出

可选环境变量（桌面联调）：

- `DEV_HOST`：Vite host，默认 `127.0.0.1`
- `DEV_PORT`：Vite port，默认 `5174`

## 环境变量

可复制 `.env.example` 到 `.env.local` 后按需覆盖：

```env
VITE_WS_URL=
VITE_ORIGINBRIDGE_API_BASE_URL=
VITE_DA_PREVIEW_CANVAS=0
CONDUCTOR_UPDATE_URL=
```

说明：

- `VITE_ORIGINBRIDGE_API_BASE_URL` 建议在本地联调 OriginBridge 时显式配置
- `CONDUCTOR_UPDATE_URL` 可覆盖桌面端默认自动更新源

## 常用脚本

质量检查：

```bash
npm run lint
npm run typecheck
npm run test:unit
```

构建与打包：

- `npm run build`：构建 Web 产物
- `npm run build:desktop`：构建桌面端所需产物（Windows 下自动构建 CSV Worker）
- `npm run pack:desktop`：打包目录，不生成安装器
- `npm run dist:desktop`：生成安装包
- `npm run pack:desktop:oneclick`：一键目录打包（缓存写入 `.device/`）
- `npm run dist:desktop:oneclick`：一键安装包构建（缓存写入 `.device/`）

发布与校验：

- `npm run verify:auto-update-config`：校验自动更新配置
- `npm run verify:origin-worker`：校验 CSV Worker 产物
- `npm run dist:desktop:publish`：本地发布 updater 资产到 GitHub Release（`gh` CLI）
- `npm run release:desktop:local`：同上，显式本地发布脚本入口

## 桌面端构建产物

输出目录：

```text
release/
```

Windows 命名规则：

- 安装器：`conductor-${version}-windows-${arch}-setup.exe`
- Portable Zip：`conductor-${version}-windows-${arch}-portable.zip`
- Portable 7z：`conductor-${version}-windows-${arch}-portable.7z`

其他平台默认命名：

```text
${productName}-${version}-${os}-${arch}.${ext}
```

## Origin Offline Worker

当前离线 Worker：

- `origin-csv-worker.exe`

默认虚拟环境目录：

```text
.venv-origin-workers/
```

构建 Worker：

```powershell
npm run build:origin-csv-worker
```

校验 Worker：

```powershell
npm run verify:origin-worker
```

手动指定 Python 版本或虚拟环境目录：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-origin-csv-worker.ps1 -PythonVersion 3.11 -VenvDir .venv-origin-workers
```

输出路径：

```text
origin/bin/origin-csv-worker.exe
```

运行时选择顺序（`device-analysis-origin:run-csv`）：

1. `ORIGIN_CSV_WORKER_PATH`
2. `origin/bin/origin-csv-worker.exe`
3. `origin/dist/origin-csv-worker.exe`
4. 仅开发环境回退：`origin/run_origin_csv.py`

更多说明见 [origin/ORIGIN_WORKERS.md](./origin/ORIGIN_WORKERS.md)。

## Desktop 持久化文件

桌面端将模板与设置拆分保存：

- 模板：`template.json`
- 设置：`config.json`
- 路径覆盖：`store-path.json`

默认路径：

```text
~/.device/template.json
~/.device/config.json
~/.device/store-path.json
```

若自定义为 `D:\DeviceAnalysis\config.json`，对应文件变为：

```text
D:\DeviceAnalysis\template.json
D:\DeviceAnalysis\config.json
```

职责划分：

- `template.json` 仅保存模板
- `config.json` 仅保存设置（语言、默认值、`originExePath` 等）

旧版本 `config.json` / `config.settings.json` 会在首次读取时自动迁移到新结构。

## 自动更新发布

发布支持自动更新的 Windows 版本，建议流程：

1. 更新 `package.json` 的 `version`
2. 推送代码与对应 tag（推荐 `v<version>`）
3. 确认 `GH_TOKEN` 或 `gh auth` 权限可上传目标 release
4. 执行 `npm run dist:desktop:publish`
5. 确认 release 中存在 `latest.yml`、`*-setup.exe` 与对应 `.blockmap`
6. 在旧版本客户端验证检查更新、下载、安装提示流程

补充：

- 自动更新仅针对打包后的 Windows 桌面版
- `npm run dev:desktop` 不代表真实自动更新行为
- 可参考 [docs/desktop-auto-update.md](./docs/desktop-auto-update.md)

## 图标资源

- `build/icons/icon.png`
- `build/icons/icon.icns`
- `build/icons/icon.ico`

从 `public/logo.svg` 重新生成：

```bash
npm run make:icons
```

## 可选签名

项目兼容 `electron-builder` 环境变量签名流程。未配置证书变量时会生成未签名安装包。

常用变量：

- macOS：`CSC_LINK`、`CSC_KEY_PASSWORD`、可选 `CSC_NAME`
- Windows：`WIN_CSC_LINK`、`WIN_CSC_KEY_PASSWORD`
