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

- `origin-csv-worker.exe` for CSV import/extract workflows

The worker build toolchain uses a project-local Python virtual environment by default:

Build scripts prefer `uv` if available, otherwise fall back to `python -m venv` + `pip`.

- `.venv-origin-workers/` (gitignored)

### Build worker executables

Desktop packaging now runs the CSV worker automatically via `npm run build:desktop`.
Note: Origin worker builds are Windows-only; `npm run build:desktop` skips this step on non-Windows platforms.

Build one worker only:

```powershell
npm run build:origin-csv-worker
```

Verify the worker exists (Windows-only):

```powershell
npm run verify:origin-worker
```

`npm run dist:desktop`, `npm run pack:desktop`, and `npm run dist:desktop:publish` run this check automatically.

Direct script example (custom venv path/version):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-origin-csv-worker.ps1 -PythonVersion 3.11 -VenvDir .venv-origin-workers
```

Output:

```text
origin/bin/origin-csv-worker.exe
```

### Runtime runner selection (desktop app)

CSV job (`device-analysis-origin:run-csv`):

1. `ORIGIN_CSV_WORKER_PATH` (if set and file exists)
2. `origin/bin/origin-csv-worker.exe` (dev)
3. `origin/dist/origin-csv-worker.exe` (dev)
4. Python fallback (dev only): `origin/run_origin_csv.py`

More details: `origin/ORIGIN_WORKERS.md`.

## Desktop persistence layout

Desktop builds persist Device Analysis data in two sibling JSON files:

- Template store: `config.json`
- Settings store: `config.settings.json`
- Path override config: `store-path.json`

Default location:

```text
~/.device/config.json
~/.device/config.settings.json
~/.device/store-path.json
```

If a custom persistence path is configured, for example:

```text
D:\DeviceAnalysis\my-store.json
```

then the desktop app uses:

```text
D:\DeviceAnalysis\my-store.json
D:\DeviceAnalysis\my-store.settings.json
```

Current file responsibilities:

- `config.json` stores templates only
- `config.settings.json` stores settings only, including language, SS defaults, and `originExePath`

Legacy combined stores are no longer migrated automatically. If you still have a historical `config.json` that contains both `templates` and `settings`, move the `settings` object into the sibling `config.settings.json` file before running the latest desktop build.

## Desktop Auto-Update Release Checklist

Use this checklist when publishing a new desktop version that clients should auto-update to.

1. Bump version in `package.json` (for example `0.5.0` -> `0.5.1`).
2. Commit and push code, then create/push the corresponding git tag.
   - If you publish via GitHub Actions, pushing the `v*` tag triggers `.github/workflows/release-windows.yml`.
3. Ensure `GH_TOKEN` is set in your shell/session (must have release upload permission for `chogng/Device-Analysis-Studio`).
4. Run:
   ```powershell
   npm run dist:desktop:publish
   ```
5. In GitHub Release assets, confirm updater files exist:
   - `latest.yml`
   - Windows installer (for example `.exe`)
   - related `.blockmap` file(s)
6. On a client machine with an older installed desktop build:
   - Wait for auto-check (startup + interval), or
   - Open Settings -> App Updates -> `Check for Updates`.
7. Verify expected behavior:
   - update is detected
   - package downloads
   - restart/install prompt appears

Notes:
- Auto-update is enabled for packaged Windows desktop builds.
- Dev mode (`npm run dev:desktop`) does not represent real updater behavior.
