import path from "node:path";

const port = Number(process.argv[2] || process.env.CONDUCTOR_CDP_PORT || 9224);
const filePath = process.argv[3] || process.env.CONDUCTOR_BENCH_FILE;
if (!Number.isFinite(port)) {
  throw new Error("Usage: node scripts/bench-electron-ipc-preview.mjs <cdp-port> <file-path>");
}
if (!filePath) {
  throw new Error(
    "Usage: node scripts/bench-electron-ipc-preview.mjs <cdp-port> <file-path> or set CONDUCTOR_BENCH_FILE.",
  );
}
const fileName = path.basename(filePath) || "device-analysis.csv";

const requestJson = async (url) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed ${response.status}: ${url}`);
  }
  return response.json();
};

const connectCdp = async (webSocketDebuggerUrl) => {
  const ws = new WebSocket(webSocketDebuggerUrl);
  const pending = new Map();
  let nextId = 0;

  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    const entry = pending.get(message.id);
    if (!entry) {
      return;
    }

    pending.delete(message.id);
    if (message.error) {
      entry.reject(new Error(message.error.message || "CDP error"));
      return;
    }

    entry.resolve(message.result);
  });

  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", () => reject(new Error("WebSocket error")), {
      once: true,
    });
  });

  return {
    close() {
      ws.close();
    },
    send(method, params = {}) {
      const id = ++nextId;
      ws.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
      });
    },
  };
};

const targets = await requestJson(`http://127.0.0.1:${port}/json/list`);
const target = targets.find((entry) => entry.type === "page");
if (!target?.webSocketDebuggerUrl) {
  throw new Error(`No Electron page target on port ${port}.`);
}

const cdp = await connectCdp(target.webSocketDebuggerUrl);
try {
  await cdp.send("Runtime.enable");
  const expression = `
    (async () => {
      const filePath = ${JSON.stringify(filePath)};
      const fileName = ${JSON.stringify(fileName)};
      const now = () => performance.now();
      const waitStart = now();
      while (
        !window.desktopImport?.prepareFileConversion ||
        !window.desktopImport?.openFileWithRust
      ) {
        if (now() - waitStart > 10000) {
          throw new Error("desktopImport bridge not ready");
        }
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      const results = {};
      let started = now();
      const prepare = await window.desktopImport.prepareFileConversion({
        fileName,
        path: filePath,
      });
      results.prepareMs = now() - started;
      results.prepareOk = Boolean(prepare?.ok);
      results.prepareRustDurationMs = prepare?.durationMs ?? null;

      started = now();
      const open = await window.desktopImport.openFileWithRust({
        fileId: "cdp-preview-test",
        fileName,
        path: filePath,
        seedRows: 5000,
      });
      results.openMs = now() - started;
      results.openOk = Boolean(open?.ok);
      results.openRustDurationMs = open?.durationMs ?? null;
      results.rows = open?.result?.rowCount ?? null;
      results.columns = open?.result?.columnCount ?? null;
      results.seedRows = Array.isArray(open?.result?.seedRows)
        ? open.result.seedRows.length
        : null;
      return results;
    })()
  `;
  const result = await cdp.send("Runtime.evaluate", {
    awaitPromise: true,
    expression,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || "Renderer evaluation failed.");
  }

  console.log(JSON.stringify(result.result.value, null, 2));
} finally {
  cdp.close();
}
