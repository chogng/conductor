# Device Analysis Studio

从 `Appointer` 中拆出的器件分析独立应用，支持 Web 和 Electron 桌面端运行。

## 功能概览

- CSV 批量导入与预览
- 模板管理
- 数据提取与异常提示
- 图表分析与导出
- Origin CSV Worker 离线处理
- Windows 桌面端自动更新

## 环境要求

- Node.js 20+
- npm 10+
- Windows 构建 Origin Worker 时需要 PowerShell

## 安装依赖

```bash
npm install
```

## 本地开发

### Web

```bash
npm run dev
```

默认地址：

```text
http://localhost:5173
```

### Desktop

```bash
npm run dev:desktop
```

当前开发流程：

- 先执行 `build:desktop:core`
- 启动 Vite 开发服务
- 打开 Electron 桌面窗口
- 关闭 Electron 后开发进程会一并退出

如果你主要在桌面端联调，优先使用 `npm run dev:desktop`。

## 常用脚本

```bash
npm run lint
npm run typecheck
npm run test:unit
```

其他常用脚本：

- `npm run build`：构建 Web 产物
- `npm run build:desktop`：构建桌面端所需产物
- `npm run pack:desktop`：打包桌面端目录，不生成安装器
- `npm run dist:desktop`：生成桌面安装包
- `npm run dist:desktop:publish`：构建并发布自动更新版本
- `npm run verify:auto-update-config`：检查自动更新配置
- `npm run verify:origin-worker`：检查 Origin CSV Worker 是否可用

## 桌面端构建产物

桌面端打包输出目录：

```text
release/
```

Windows 产物命名规则：

- 安装器：`Device-Analysis-Studio-${version}-windows-${arch}-setup.exe`
- Portable Zip：`Device-Analysis-Studio-${version}-windows-${arch}-portable.zip`
- Portable 7z：`Device-Analysis-Studio-${version}-windows-${arch}-portable.7z`

其他平台默认命名规则：

```text
${productName}-${version}-${os}-${arch}.${ext}
```

## 图标资源

图标文件位置：

- `build/icons/icon.png`
- `build/icons/icon.icns`
- `build/icons/icon.ico`

如果需要从 `public/logo.svg` 重新生成图标：

```bash
npm run make:icons
```

## 运行模式

项目默认启用本地 mock：

```env
VITE_MOCK_API=true
VITE_MOCK_AUTO_LOGIN=true
VITE_MOCK_USER=admin
```

可在 `.env.local` 中覆盖这些配置。

## Origin Offline Workers

当前项目支持离线 Origin Worker，现阶段包含：

- `origin-csv-worker.exe`

默认使用项目本地虚拟环境构建：

```text
.venv-origin-workers/
```

构建逻辑会优先使用 `uv`，不可用时回退到 `python -m venv` + `pip`。

### 构建 Worker

```powershell
npm run build:origin-csv-worker
```

校验 Worker：

```powershell
npm run verify:origin-worker
```

`npm run build:desktop` 会自动处理桌面构建所需的 Worker。  
`npm run pack:desktop`、`npm run dist:desktop` 和 `npm run dist:desktop:publish` 会自动执行校验。

如果需要手动指定 Python 版本或虚拟环境目录：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-origin-csv-worker.ps1 -PythonVersion 3.11 -VenvDir .venv-origin-workers
```

输出文件：

```text
origin/bin/origin-csv-worker.exe
```

### 桌面端运行时选择顺序

CSV 任务 `device-analysis-origin:run-csv` 按以下顺序选择运行器：

1. `ORIGIN_CSV_WORKER_PATH`
2. `origin/bin/origin-csv-worker.exe`
3. `origin/dist/origin-csv-worker.exe`
4. 开发环境下回退到 `origin/run_origin_csv.py`

更多说明见 [origin/ORIGIN_WORKERS.md](c:\Users\lanxi\Desktop\Device-Analysis-Studio\origin\ORIGIN_WORKERS.md)。

## Desktop 持久化文件

桌面端会将数据拆分存到两个相邻 JSON 文件中：

- 模板：`template.json`
- 设置：`config.json`
- 路径覆盖配置：`store-path.json`

默认位置：

```text
~/.device/template.json
~/.device/config.json
~/.device/store-path.json
```

如果自定义存储路径，例如：

```text
D:\DeviceAnalysis\config.json
```

则对应文件会变为：

```text
D:\DeviceAnalysis\template.json
D:\DeviceAnalysis\config.json
```

当前职责划分：

- `template.json` 只保存模板
- `config.json` 只保存设置，包括语言、默认值和 `originExePath`

历史版本如果仍在使用旧的 `config.json` / `config.settings.json` 结构，桌面端会在首次读取时自动迁移为 `template.json` + `config.json`。迁移完成后，模板和设置会分开存储。

## 桌面端自动更新发布检查

发布支持自动更新的 Windows 桌面版本时，建议按下面流程检查：

1. 更新 `package.json` 中的版本号。
2. 提交代码并推送对应 git tag。
3. 确认当前环境已设置 `GH_TOKEN`，且具备 `chogng/Device-Analysis-Studio` 的 release 上传权限。
4. 运行 `npm run dist:desktop:publish`。
5. 在 GitHub Release 中确认存在 `latest.yml`、安装包和对应的 `.blockmap` 文件。
6. 在旧版本客户端上验证更新检查、下载和安装提示流程。

补充说明：

- 自动更新仅适用于打包后的 Windows 桌面版本
- `npm run dev:desktop` 不代表真实的自动更新行为

## 可选签名

项目兼容 `electron-builder` 的环境变量签名流程。不设置证书变量时会产出未签名安装包；设置后会自动参与签名。

常用变量：

- macOS：`CSC_LINK`、`CSC_KEY_PASSWORD`、可选 `CSC_NAME`
- Windows：`WIN_CSC_LINK`、`WIN_CSC_KEY_PASSWORD`
