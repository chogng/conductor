import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow } from "electron";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SPLASH_WINDOW_BOUNDS = {
  width: 440,
  height: 300,
  minWidth: 360,
  minHeight: 240,
};

function getResourcesPath() {
  const resourcesPath = Reflect.get(process, "resourcesPath");
  return typeof resourcesPath === "string" ? resourcesPath : process.cwd();
}

function resolveFirstExistingPath(candidates) {
  const list = Array.isArray(candidates) ? candidates : [];
  for (const item of list) {
    if (typeof item !== "string") continue;
    const candidate = item.trim();
    if (!candidate) continue;
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function resolveDesktopBootLogoDataUrl() {
  const candidates = app.isPackaged
    ? [
        path.join(__dirname, "../dist/logo.svg"),
        path.join(getResourcesPath(), "dist", "logo.svg"),
      ]
    : [
        path.join(__dirname, "..", "public", "logo.svg"),
        path.join(process.cwd(), "public", "logo.svg"),
      ];
  const logoPath = resolveFirstExistingPath(candidates);
  if (!logoPath) return "";

  try {
    const svg = fs.readFileSync(logoPath, "utf8");
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  } catch (error) {
    console.warn("[boot] Failed to inline splash logo:", error?.message || error);
    return "";
  }
}

function buildInstantBootHtml() {
  const logoUrl = resolveDesktopBootLogoDataUrl();
  return `<!doctype html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    html, body {
      margin: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: #f5f4ef;
      color: #222222;
      font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .boot-pane {
      display: flex;
      height: 100%;
      align-items: center;
      justify-content: center;
      background: #f5f4ef;
      user-select: none;
    }
    .boot-pane-content {
      display: flex;
      width: min(320px, calc(100vw - 48px));
      flex-direction: column;
      align-items: center;
      gap: 14px;
      text-align: center;
    }
    .boot-pane-logo {
      display: block;
      width: 58px;
      height: 58px;
      object-fit: contain;
    }
    .boot-pane-brand {
      margin: 0;
      color: #222222;
      font-size: 21px;
      font-weight: 650;
      line-height: 1.1;
      letter-spacing: 0;
    }
    .boot-pane-copy {
      margin: 0;
      color: rgba(34,34,34,.66);
      font-size: 14px;
      font-weight: 500;
      line-height: 1.45;
      letter-spacing: 0;
    }
    .boot-pane-bar {
      position: relative;
      width: 168px;
      height: 3px;
      overflow: hidden;
      border-radius: 999px;
      background: rgba(34,34,34,.09);
    }
    .boot-pane-bar::after {
      position: absolute;
      inset: 0;
      width: 46%;
      border-radius: inherit;
      background: #222222;
      content: "";
      animation: boot-pane-progress 1.1s ease-in-out infinite;
    }
    @keyframes boot-pane-progress {
      0% { transform: translateX(-115%); }
      100% { transform: translateX(255%); }
    }
    @media (prefers-color-scheme: dark) {
      html, body { background: #0b0b0c; color: #f5f4ef; }
      .boot-pane { background: #0b0b0c; }
      .boot-pane-brand { color: #f5f4ef; }
      .boot-pane-copy { color: rgba(245,244,239,.64); }
      .boot-pane-bar { background: rgba(245,244,239,.14); }
      .boot-pane-bar::after { background: #f5f4ef; }
    }
  </style>
</head>
<body>
  <div class="boot-pane">
    <div class="boot-pane-content">
      ${logoUrl ? `<img class="boot-pane-logo" src="${logoUrl}" alt="" />` : ""}
      <h1 class="boot-pane-brand" data-boot-brand="true" data-boot-text="Conductor">Conductor</h1>
      <p class="boot-pane-copy">超能分析，马上就绪</p>
      <div class="boot-pane-bar"></div>
    </div>
  </div>
  <script>
    (function () {
      var finalText = "Conductor";
      var chars = "abcdefghijklmnopqrstuvwxyz";
      var frame = 0;
      function nextText() {
        var resolved = Math.floor(frame / 4) % (finalText.length + 1);
        var text = "";
        for (var i = 0; i < finalText.length; i += 1) {
          text += i < resolved ? finalText[i] : chars[(frame * 3 + i * 11) % chars.length];
        }
        return text;
      }
      function tick() {
        var brand = document.querySelector("[data-boot-brand=true]");
        if (!brand) return;
        var text = nextText();
        brand.textContent = text;
        brand.setAttribute("data-boot-text", text);
        frame += 1;
      }
      tick();
      setInterval(tick, 48);
    })();
  </script>
</body>
</html>`;
}

export function createBootSplashWindow({ icon, logDesktopBoot }) {
  logDesktopBoot("create-splash-window:start");

  const win = new BrowserWindow({
    width: SPLASH_WINDOW_BOUNDS.width,
    height: SPLASH_WINDOW_BOUNDS.height,
    minWidth: SPLASH_WINDOW_BOUNDS.minWidth,
    minHeight: SPLASH_WINDOW_BOUNDS.minHeight,
    icon,
    backgroundColor: "#f5f4ef",
    autoHideMenuBar: true,
    center: true,
    frame: false,
    fullscreenable: false,
    maximizable: false,
    minimizable: false,
    resizable: false,
    show: false,
    skipTaskbar: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (process.platform !== "darwin") {
    win.removeMenu();
    win.setAutoHideMenuBar(true);
    win.setMenuBarVisibility(false);
  }

  win.once("ready-to-show", () => {
    if (win.isDestroyed()) return;
    logDesktopBoot("splash-window:ready-to-show");
    win.show();
  });

  logDesktopBoot("splash-window:load-data-url");
  void win.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(buildInstantBootHtml())}`,
  );

  return win;
}
