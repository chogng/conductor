const path = require("node:path");
const { app, BrowserWindow, ipcMain, Menu, shell } = require("electron");

const isDev = !app.isPackaged;
const isWindows = process.platform === "win32";
const devUrl = process.env.ELECTRON_START_URL || "http://127.0.0.1:5174/";

function createMainWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1080,
    minHeight: 700,
    autoHideMenuBar: true,
    frame: !isWindows,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (process.platform !== "darwin") {
    win.removeMenu();
    win.setAutoHideMenuBar(true);
    win.setMenuBarVisibility(false);
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  if (isDev) {
    void win.loadURL(devUrl);
    return;
  }

  void win.loadFile(path.join(__dirname, "../dist/index.html"));
}

function handleDesktopCommand(event, payload) {
  const command =
    payload && typeof payload.command === "string" ? payload.command : "";
  if (!command) return;

  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed()) return;

  if (command === "toggle-devtools") {
    if (win.webContents.isDevToolsOpened()) {
      win.webContents.closeDevTools();
      return;
    }
    win.webContents.openDevTools({ mode: "detach" });
    return;
  }

  if (command === "reload-window") {
    win.webContents.reload();
    return;
  }

  if (command === "minimize-window") {
    win.minimize();
    return;
  }

  if (command === "toggle-maximize-window") {
    if (win.isMaximized()) {
      win.unmaximize();
      return;
    }
    win.maximize();
    return;
  }

  if (command === "close-window") {
    win.close();
  }
}

app.whenReady().then(() => {
  if (process.platform !== "darwin") {
    Menu.setApplicationMenu(null);
  }

  ipcMain.on("desktop-command", handleDesktopCommand);
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("will-quit", () => {
  ipcMain.removeListener("desktop-command", handleDesktopCommand);
});
