import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

import { _electron as electron, chromium } from "playwright";
import { createServer } from "vite";

import { stressViewport, traceQuery, workspace } from "./constants.mjs";

export const startViteServer = async () => {
  const server = await createServer({
    configFile: path.join(workspace, "vite.config.ts"),
    configLoader: "runner",
    root: workspace,
    server: {
      hmr: false,
      host: "127.0.0.1",
      port: 0,
    },
  });
  await server.listen();
  const address = server.httpServer?.address();
  assert.equal(typeof address, "object");
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => server.close(),
  };
};

export const withTraceQuery = (url) => `${url}${url.includes("?") ? "&" : "?"}${traceQuery}`;

export const openRuntime = async ({
  autoFolderPath,
  baseUrl,
  browserChannel,
  initialLocalStorage = {},
  runtime,
}) => {
  if (runtime === "desktop") {
    const buildCommand = process.platform === "win32" ? "cmd.exe" : "npm";
    const buildArgs = process.platform === "win32"
      ? ["/d", "/s", "/c", "npm", "run", "build:desktop:core"]
      : ["run", "build:desktop:core"];
    const build = spawnSync(buildCommand, buildArgs, {
      cwd: workspace,
      encoding: "utf8",
      stdio: "inherit",
    });
    assert.equal(build.status, 0, "desktop core build failed");
    const app = await electron.launch({
      args: [
        ".",
        "--window-size=1920,1200",
        "--user-data-dir",
        path.join(tmpdir(), `conductor-import-trace-${Date.now()}`),
      ],
      cwd: workspace,
      env: {
        ...process.env,
        CONDUCTOR_DEV: "1",
        ...(autoFolderPath ? { CONDUCTOR_IMPORT_TRACE_FOLDER: autoFolderPath } : {}),
        ELECTRON_START_URL: withTraceQuery(`${baseUrl}/src/cs/code/electron-browser/workbench/workbench-dev.html`),
      },
    });
    const page = await app.firstWindow();
    await installInitialLocalStorage(page, initialLocalStorage);
    await page.setViewportSize(stressViewport).catch(() => {});
    return {
      browser: null,
      close: () => app.close(),
      page,
      processRootPid: app.process()?.pid ?? null,
    };
  }

  const processRowsBeforeLaunch = readProcessRows();
  const browser = await chromium.launch({
    ...(browserChannel ? { channel: browserChannel } : {}),
    headless: false,
  });
  const page = await browser.newPage({ viewport: stressViewport });
  await installInitialLocalStorage(page, initialLocalStorage);
  await page.goto(withTraceQuery(`${baseUrl}/src/cs/code/browser/workbench/workbench-dev.html`), {
    waitUntil: "domcontentloaded",
  });
  return {
    browser,
    close: () => browser.close(),
    page,
    processRootPid: resolveBrowserProcessPid(browser) ??
      findNewBrowserProcessRootPid(processRowsBeforeLaunch),
  };
};

const installInitialLocalStorage = async (page, entries) => {
  const storageEntries = Object.entries(entries ?? {});
  if (!storageEntries.length) {
    return;
  }

  await page.addInitScript((items) => {
    for (const [key, value] of items) {
      window.localStorage.setItem(key, value);
    }
  }, storageEntries);
};

export const getOpenFolderButton = (page) =>
  page.getByRole("button", { name: /^(打开文件夹|导入文件夹|Open Folder)$/ });


export const startResourceSampler = ({ page, processRootPid, runtime, sampleMs }) => {
  const samples = [];
  let stopped = false;
  const cdpSession = page.context().newCDPSession(page)
    .then(async (session) => {
      await session.send("Performance.enable").catch(() => {});
      return session;
    })
    .catch(() => null);
  const sample = async () => {
    if (stopped) {
      return;
    }
    const cdp = await cdpSession;
    const performanceMetrics = cdp
      ? await cdp.send("Performance.getMetrics")
          .then(result => Object.fromEntries(
            result.metrics.map(metric => [metric.name, metric.value]),
          ))
          .catch(() => null)
      : null;
    const renderer = await page.evaluate(() => {
      const memory = performance.memory;
      return {
        timestamp: performance.now(),
        usedJSHeapSize: memory?.usedJSHeapSize ?? null,
        totalJSHeapSize: memory?.totalJSHeapSize ?? null,
        jsHeapSizeLimit: memory?.jsHeapSizeLimit ?? null,
      };
    }).catch(() => null);
    samples.push({
      process: readProcessTreeSample(processRootPid),
      performanceMetrics,
      renderer,
      runtime,
      wallTime: Date.now(),
    });
  };
  const interval = setInterval(() => {
    void sample();
  }, sampleMs);
  void sample();
  return {
    samples,
    stop: () => {
      stopped = true;
      clearInterval(interval);
    },
  };
};

export const readProcessTreeSample = (rootPid) => {
  if (!rootPid) {
    return null;
  }
  const rows = readProcessRows();
  if (!rows.length) {
    return null;
  }
  const byParent = new Map();
  for (const row of rows) {
    const list = byParent.get(row.ppid) ?? [];
    list.push(row);
    byParent.set(row.ppid, list);
  }
  const descendants = [];
  const visit = (pid) => {
    for (const child of byParent.get(pid) ?? []) {
      descendants.push(child);
      visit(child.pid);
    }
  };
  const root = rows.find(row => row.pid === rootPid);
  if (root) {
    descendants.push(root);
  }
  visit(rootPid);
  return {
    cpuPercent: descendants.reduce((sum, row) => sum + row.cpuPercent, 0),
    processCount: descendants.length,
    rssKb: descendants.reduce((sum, row) => sum + row.rssKb, 0),
    rootPid,
  };
};

export const readProcessRows = () => {
  const result = spawnSync("ps", ["-axo", "pid=,ppid=,%cpu=,rss=,comm="], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    return [];
  }
  return result.stdout.split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\d+)\s+(\d+)\s+([\d.]+)\s+(\d+)\s+(.+)$/);
      return match
        ? {
            pid: Number(match[1]),
            ppid: Number(match[2]),
            cpuPercent: Number(match[3]),
            rssKb: Number(match[4]),
            command: match[5],
          }
        : null;
    })
    .filter(Boolean);
};

export const resolveBrowserProcessPid = (browser) => {
  const processGetter = browser?.process;
  if (typeof processGetter !== "function") {
    return null;
  }

  try {
    return processGetter.call(browser)?.pid ?? null;
  } catch {
    return null;
  }
};

export const findNewBrowserProcessRootPid = (rowsBeforeLaunch) => {
  const beforePids = new Set(rowsBeforeLaunch.map(row => row.pid));
  const browserRows = readProcessRows().filter(row =>
    !beforePids.has(row.pid) &&
    /chrom(e|ium)|google chrome/i.test(row.command)
  );
  if (!browserRows.length) {
    return null;
  }

  const browserPids = new Set(browserRows.map(row => row.pid));
  const roots = browserRows.filter(row => !browserPids.has(row.ppid));
  return (roots[0] ?? browserRows[0]).pid;
};

export const readTraceState = async (page) => page.evaluate(() => {
  const trace = window.__conductorTemplateApplyPerformanceTrace;
  const hosts = [...document.querySelectorAll(".file-list-item-review-decoration[data-state]")];
  const apply = [...document.querySelectorAll("button")]
    .find(button => /^(应用到所有|Apply to All)$/.test((button.textContent || "").trim()));
  return {
    dom: {
      reviewDecorationCount: hosts.filter(host => host.dataset.state === "decoration" && host.textContent?.trim() !== "...").length,
      fast: hosts.filter(host => host.dataset.source === "fast").length,
      hosts: hosts.length,
      loading: [...document.querySelectorAll("[data-source-status]")]
        .filter(host => host.dataset.sourceStatus === "pending" || host.dataset.sourceStatus === "preparing").length,
      pending: hosts.filter(host => host.textContent?.trim() === "...").length,
      applyDisabled: apply ? apply.disabled : null,
      applyVisible: Boolean(apply),
    },
    events: trace?.events ? [...trace.events] : [],
  };
});

export const installPageTraceObservers = async (page) => page.evaluate(() => {
  const target = window;
  if (target.__conductorTemplateApplyPerformanceTraceObserverInstalled) {
    return;
  }

  target.__conductorTemplateApplyPerformanceTraceObserverInstalled = true;
  const traceMark = (stage, meta = {}) => {
    const trace = target.__conductorTemplateApplyPerformanceTrace;
    if (trace && typeof trace.mark === "function") {
      trace.mark(stage, meta);
    }
  };
  const readBadgeDom = () => {
    const hosts = [...document.querySelectorAll(".file-list-item-review-decoration[data-state]")];
    const sourceHosts = [...document.querySelectorAll("[data-source-status]")];
    return {
      reviewDecorationCount: hosts.filter(host => host.dataset.state === "decoration" && host.textContent?.trim() !== "...").length,
      fastBadgeCount: hosts.filter(host => host.dataset.source === "fast").length,
      hostCount: hosts.length,
      loadingSourceCount: sourceHosts.filter(host =>
        host.dataset.sourceStatus === "pending" ||
        host.dataset.sourceStatus === "preparing"
      ).length,
      pendingBadgeCount: hosts.filter(host => host.textContent?.trim() === "...").length,
    };
  };
  let badgeSignature = "";
  const emitBadgeDom = () => {
    const dom = readBadgeDom();
    const signature = [
      dom.reviewDecorationCount,
      dom.fastBadgeCount,
      dom.hostCount,
      dom.loadingSourceCount,
      dom.pendingBadgeCount,
    ].join(":");
    if (signature === badgeSignature) {
      return;
    }

    badgeSignature = signature;
    traceMark("import.badge.dom", dom);
  };

  let pendingBadgeRead = false;
  const scheduleBadgeRead = () => {
    if (pendingBadgeRead) {
      return;
    }

    pendingBadgeRead = true;
    const run = () => {
      pendingBadgeRead = false;
      emitBadgeDom();
    };
    if (typeof target.requestAnimationFrame === "function") {
      target.requestAnimationFrame(run);
      return;
    }
    target.setTimeout(run, 0);
  };

  const observer = new MutationObserver((mutations) => {
    if (mutations.some(mutation =>
      mutation.type === "childList" ||
      mutation.attributeName === "data-state" ||
      mutation.attributeName === "data-source" ||
      mutation.attributeName === "data-source-status"
    )) {
      scheduleBadgeRead();
    }
  });
  observer.observe(document.body || document.documentElement, {
    attributeFilter: ["data-state", "data-source", "data-source-status"],
    attributes: true,
    childList: true,
    subtree: true,
  });

  const intervalMs = 50;
  let expected = performance.now() + intervalMs;
  const lagTimer = target.setInterval(() => {
    const now = performance.now();
    const lagMs = now - expected;
    expected = now + intervalMs;
    if (lagMs > 24) {
      traceMark("import.runtime.eventLoopLag", {
        durationMs: lagMs,
        intervalMs,
      });
    }
  }, intervalMs);

  let longTaskObserver = null;
  try {
    longTaskObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration < 24) {
          continue;
        }
        traceMark("import.runtime.longTask", {
          durationMs: entry.duration,
          name: entry.name,
          startTime: entry.startTime,
        });
      }
    });
    longTaskObserver.observe({ entryTypes: ["longtask"] });
  } catch {
    longTaskObserver = null;
  }

  target.__conductorTemplateApplyPerformanceTraceObserverStop = () => {
    observer.disconnect();
    target.clearInterval(lagTimer);
    longTaskObserver?.disconnect();
    target.__conductorTemplateApplyPerformanceTraceObserverInstalled = false;
  };
  emitBadgeDom();
});

export const stopPageTraceObservers = async (page) => page.evaluate(() => {
  window.__conductorTemplateApplyPerformanceTraceObserverStop?.();
}).catch(() => {});

export const enableAnalysisPerf = async (page) => page.evaluate(() => {
  window.localStorage.setItem("conductor.perf", "1");
  window.conductorAnalysisPerf?.clear?.();
}).catch(() => {});

export const readAnalysisPerfReport = async (page) => page.evaluate(() =>
  window.conductorAnalysisPerf?.getReport?.() ?? null
).catch(() => null);

export const readPerformanceTraceReport = async (page) => page.evaluate(() =>
  window.__conductorPerformanceTrace?.getReport?.() ?? null
).catch(() => null);

export const markPageTrace = async (page, stage, meta = {}) => page.evaluate(({
  meta: markMeta,
  stage: markStage,
}) =>
  window.__conductorTemplateApplyPerformanceTrace?.mark?.(markStage, markMeta) ?? null,
{ meta, stage },
).catch(() => null);

export const createPhaseRecorder = (page, runtime) => {
  const anchors = [];
  return {
    anchors,
    mark: async (name, meta = {}) => {
      const anchor = {
        meta,
        name,
        runtime,
        wallTime: Date.now(),
      };
      anchors.push(anchor);
      await markPageTrace(page, "bench.phase", {
        ...meta,
        phase: name,
        runtime,
        wallTime: anchor.wallTime,
      });
      return anchor;
    },
  };
};


export const waitForTraceCompletion = async ({
  expectedReviewDecorationCount,
  expectedPrepareCompletionCount,
  page,
  timeoutMs,
}) => {
  const started = Date.now();
  let latest = null;
  while (Date.now() - started < timeoutMs) {
    latest = await readTraceState(page);
    const events = latest.events;
    const projection = [...events].reverse().find(event => event.stage === "import.badge.projection");
    const prepareCompletionCount = events.filter(event =>
      event.stage === "import.prepare.file.complete" ||
      event.stage === "import.prepare.file.failed"
    ).length;
    const reviewDecorationCount = Math.max(
      Number(projection?.meta?.reviewDecorationCount ?? 0),
      Number(latest.dom?.reviewDecorationCount ?? 0),
    );
    const loadingSourceCount = Math.max(
      Number(projection?.meta?.loadingSourceCount ?? 0),
      Number(latest.dom?.loading ?? 0),
    );
    const applyReady = latest.dom?.applyVisible === true && latest.dom?.applyDisabled === false;
    if (
      prepareCompletionCount >= expectedPrepareCompletionCount &&
      reviewDecorationCount >= expectedReviewDecorationCount &&
      (loadingSourceCount === 0 || applyReady)
    ) {
      await page.evaluate(() => new Promise(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      }));
      return readTraceState(page);
    }
    await page.waitForTimeout(100);
  }
  throw new Error(
    `Timed out waiting for ${expectedPrepareCompletionCount} prepare completions and ` +
      `${expectedReviewDecorationCount} review decorations. Last state: ${JSON.stringify(latest?.dom)}`,
  );
};
