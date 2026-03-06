# Device Analysis Standalone

从 `Appointer` 项目中拆出的“器件分析”独立应用，支持 Web 与 Electron 桌面端。

## 功能
- CSV 批量导入与预览
- 模板管理（保存/应用/删除）
- 数据提取与异常提示
- 图表分析与导出（JSON/CSV/Origin ZIP）

## 安装依赖
```bash
npm install
```

## Web 运行
```bash
npm run dev
```
默认地址：`http://localhost:5173`

## 桌面端运行（开发模式）
```bash
npm run dev:desktop
```
说明：
- 会自动启动 Vite（`127.0.0.1:5174`）并打开 Electron 窗口
- 关闭 Electron 后，Vite 也会自动退出

## 桌面端打包
```bash
npm run dist:desktop
```
产物目录：`release/`

如只想先验证可打包结构（不生成安装器）：
```bash
npm run pack:desktop
```

## 图标与安装包命名
- 图标文件：
  - `build/icons/icon.png`（Linux）
  - `build/icons/icon.icns`（macOS）
  - `build/icons/icon.ico`（Windows）
- 如需从 `public/logo.svg` 重新生成图标（macOS）：
```bash
npm run make:icons
```
- 安装包命名规则：`${productName}-${version}-${os}-${arch}.${ext}`

## 可选签名
本项目已兼容 `electron-builder` 的环境变量签名流程。  
不设置证书变量时，会产出未签名安装包；设置后会自动签名。

常用变量（按平台选择）：
- macOS：`CSC_LINK`、`CSC_KEY_PASSWORD`（可选 `CSC_NAME`）
- Windows：`WIN_CSC_LINK`、`WIN_CSC_KEY_PASSWORD`

## 运行模式
项目默认启用本地 mock：
- `VITE_MOCK_API=true`
- `VITE_MOCK_AUTO_LOGIN=true`
- `VITE_MOCK_USER=admin`

配置文件：`.env.local`

## Origin Offline Workers

This project supports offline-native Origin workers built via `pyinstaller`:

- `origin-zip-worker.exe` for single ZIP import/plot (`Open in Origin`)
- `origin-batch-worker.exe` for folder batch processing

The worker build toolchain uses a project-local Python virtual environment by default:

Build scripts prefer `uv` if available, otherwise fall back to `python -m venv` + `pip`.

- `.venv-origin-workers/` (gitignored)

### Build worker executables

Build both workers:

```powershell
npm run build:origin-worker
```

Desktop packaging now runs this automatically via `npm run build:desktop`.

Build one worker only:

```powershell
npm run build:origin-zip-worker
npm run build:origin-batch-worker
```

Direct script example (custom venv path/version):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-origin-workers.ps1 -PythonVersion 3.11 -VenvDir .venv-origin-workers
```

Output:

```text
origin/bin/origin-zip-worker.exe
origin/bin/origin-batch-worker.exe
```

### Runtime runner selection (desktop app)

ZIP job (`device-analysis-origin:run-zip`):

1. `ORIGIN_ZIP_WORKER_PATH` (if set and file exists)
2. `origin/bin/origin-zip-worker.exe` (dev)
3. `origin/dist/origin-zip-worker.exe` (dev)
4. PowerShell fallback: `origin/run_origin_job.ps1`

Batch job (`device-analysis-origin:run-batch`):

1. `ORIGIN_BATCH_WORKER_PATH` (if set and file exists)
2. `origin/bin/origin-batch-worker.exe` (dev)
3. `origin/dist/origin-batch-worker.exe` (dev)
4. Python fallback: `origin/run_origin_batch.py`

More details: `origin/BATCH_WORKER.md`.
