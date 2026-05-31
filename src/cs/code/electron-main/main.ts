// Main-process entry, mirroring VS Code's code/electron-main/main.ts split.
import "../../../bootstrap-esm.js";

// Importing app.ts starts the native desktop application and registers its services.
import "./app.js";
