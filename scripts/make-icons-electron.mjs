import fs from "node:fs";
import { app, BrowserWindow } from "electron";

const [, , svgPath, outDir, sizeArg] = process.argv;
const sizes = String(sizeArg || "")
  .split(",")
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isFinite(value) && value > 0);

async function main() {
  if (!svgPath || !outDir || sizes.length === 0) {
    throw new Error("Usage: make-icons-electron <svgPath> <outDir> <sizes>");
  }

  await app.whenReady();

  const svgContent = fs.readFileSync(svgPath, "utf8");
  const svgBase64 = Buffer.from(svgContent, "utf8").toString("base64");
  const window = new BrowserWindow({
    width: 1200,
    height: 1200,
    show: false,
    webPreferences: {
      sandbox: false,
      contextIsolation: true,
    },
  });

  const html = `<!doctype html>
<html>
  <body style="margin:0;background:transparent;">
    <img id="source" alt="" src="data:image/svg+xml;base64,${svgBase64}" />
  </body>
</html>`;
  await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

  const result = await window.webContents.executeJavaScript(
    `new Promise((resolve, reject) => {
      const img = document.getElementById("source");
      if (!img) {
        reject(new Error("missing source image"));
        return;
      }

      const render = () => {
        try {
          const outputs = {};
          for (const size of ${JSON.stringify(sizes)}) {
            const canvas = document.createElement("canvas");
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext("2d");
            ctx.clearRect(0, 0, size, size);
            ctx.drawImage(img, 0, 0, size, size);
            outputs[size] = canvas.toDataURL("image/png");
          }
          resolve(outputs);
        } catch (error) {
          reject(error);
        }
      };

      if (img.complete) {
        render();
        return;
      }

      img.addEventListener("load", render, { once: true });
      img.addEventListener("error", () => reject(new Error("svg image failed to load")), { once: true });
    })`,
    true,
  );

  window.destroy();

  for (const size of sizes) {
    const dataUrl = result[size];
    if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/png;base64,")) {
      throw new Error(`Missing PNG data for icon size ${size}`);
    }
    const pngBuffer = Buffer.from(dataUrl.slice("data:image/png;base64,".length), "base64");
    fs.writeFileSync(`${outDir}/icon-${size}.png`, pngBuffer);
  }
}

main()
  .catch((error) => {
    console.error("[make-icons-electron]", error?.message || error);
    process.exitCode = 1;
  })
  .finally(() => {
    app.quit();
  });
