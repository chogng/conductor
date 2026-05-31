// Electron-builder still points package.json#main at desktop-dist/desktop/main.js.
// The real main-process implementation now lives under code/electron-main to match
// the upstream VS Code entry layout while keeping packaged app metadata stable.
import "../src/cs/code/electron-main/main.js";
