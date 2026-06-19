const titlebarButtonSelector = {
  chart: "#workbench-titlebar-chart-button",
  table: "#workbench-titlebar-table-button",
};

const visibleViewSelector = {
  chart: ".chart_view",
  table: ".table_view",
};

export const runExplorerModeSwitchProbe = async ({
  page,
  settleMs = 120,
  timeoutMs,
}) => {
  await page.locator(titlebarButtonSelector.chart).waitFor({ timeout: timeoutMs });
  await page.locator(titlebarButtonSelector.table).waitFor({ timeout: timeoutMs });

  const before = await startExplorerModeSwitchDomProbe(page);
  await switchWorkbenchMode(page, "chart", timeoutMs);
  await page.waitForTimeout(settleMs);
  const afterChart = await readExplorerModeSwitchDomProbe(page);

  await switchWorkbenchMode(page, "table", timeoutMs);
  await page.waitForTimeout(settleMs);
  const afterTable = await stopExplorerModeSwitchDomProbe(page);

  return {
    afterChart,
    afterTable,
    before,
    eventCounts: countEvents(afterTable.events),
  };
};

const switchWorkbenchMode = async (page, mode, timeoutMs) => {
  await page.locator(titlebarButtonSelector[mode]).click();
  await page.waitForFunction((selector) => {
    const element = document.querySelector(selector);
    return element instanceof HTMLElement && element.getClientRects().length > 0;
  }, visibleViewSelector[mode], { timeout: timeoutMs });
};

const startExplorerModeSwitchDomProbe = async (page) => page.evaluate(() => {
  const target = window;
  target.__conductorExplorerModeSwitchProbe?.observer?.disconnect?.();

  let nextNodeId = 1;
  const ensureNodeId = (node) => {
    if (!(node instanceof HTMLElement)) {
      return null;
    }
    const existing = node.dataset.traceNodeId;
    if (existing) {
      return existing;
    }
    const id = String(nextNodeId);
    nextNodeId += 1;
    node.dataset.traceNodeId = id;
    return id;
  };
  const seedNodes = () => {
    for (const node of document.querySelectorAll(".ui-list__row, .file-list-item, .file-list-item-assessment")) {
      ensureNodeId(node);
    }
  };
  const readState = () => {
    seedNodes();
    const rows = [...document.querySelectorAll(".ui-list__row")]
      .filter(row => row instanceof HTMLElement);
    const fileItems = [...document.querySelectorAll(".file-list-item")]
      .filter(item => item instanceof HTMLElement);
    const badges = [...document.querySelectorAll(".file-list-item-assessment")]
      .filter(badge => badge instanceof HTMLElement);
    return {
      badgeNodeIds: badges.map(badge => badge.dataset.traceNodeId ?? null),
      badgeSignature: badges.map(badge => [
        badge.closest(".file-list-item")?.dataset.fileId ?? "",
        badge.textContent?.trim() ?? "",
        badge.dataset.state ?? "",
        badge.dataset.source ?? "",
        badge.hidden ? "hidden" : "visible",
      ].join(":")).join("|"),
      badgeText: badges.map(badge => badge.textContent?.trim() ?? ""),
      fileItemCount: fileItems.length,
      fileItemNodeIds: fileItems.map(item => item.dataset.traceNodeId ?? null),
      rowCount: rows.length,
      rowNodeIds: rows.map(row => row.dataset.traceNodeId ?? null),
      selectedFileId: document.querySelector(".file-list-item[data-selected='true']")?.dataset.fileId ?? null,
      viewLayout: document.querySelector(".file-list-tree-root")?.dataset.viewLayout ?? null,
    };
  };

  seedNodes();
  const events = [];
  const summarizeNodes = (nodes) => {
    let badgeCount = 0;
    let fileItemCount = 0;
    let rowCount = 0;
    for (const node of nodes) {
      if (!(node instanceof HTMLElement)) {
        continue;
      }
      if (node.matches(".file-list-item-assessment") || node.querySelector(".file-list-item-assessment")) {
        badgeCount += 1;
      }
      if (node.matches(".file-list-item") || node.querySelector(".file-list-item")) {
        fileItemCount += 1;
      }
      if (node.matches(".ui-list__row") || node.querySelector(".ui-list__row")) {
        rowCount += 1;
      }
    }
    return { badgeCount, fileItemCount, rowCount };
  };
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      const targetNode = mutation.target instanceof HTMLElement ? mutation.target : null;
      if (
        targetNode &&
        !targetNode.closest(".file-list-tree-root") &&
        !targetNode.matches(".file-list-tree-root")
      ) {
        continue;
      }
      if (mutation.type === "childList") {
        events.push({
          added: summarizeNodes(mutation.addedNodes),
          removed: summarizeNodes(mutation.removedNodes),
          type: "childList",
        });
      } else if (mutation.type === "attributes") {
        events.push({
          attributeName: mutation.attributeName,
          fileId: targetNode?.closest(".file-list-item")?.dataset.fileId ?? null,
          nodeClass: targetNode?.className ?? null,
          type: "attributes",
        });
      }
    }
  });
  observer.observe(document.body || document.documentElement, {
    attributeFilter: [
      "class",
      "data-badge-source",
      "data-badge-state",
      "data-chart-state",
      "data-file-id",
      "data-has-chart-data",
      "data-selected",
      "data-source-status",
      "hidden",
    ],
    attributes: true,
    childList: true,
    subtree: true,
  });
  target.__conductorExplorerModeSwitchProbe = {
    events,
    observer,
    readState,
  };
  return {
    events: [],
    state: readState(),
  };
});

const readExplorerModeSwitchDomProbe = async (page) => page.evaluate(() => {
  const probe = window.__conductorExplorerModeSwitchProbe;
  return {
    events: probe?.events ? [...probe.events] : [],
    state: probe?.readState?.() ?? null,
  };
});

const stopExplorerModeSwitchDomProbe = async (page) => page.evaluate(() => {
  const probe = window.__conductorExplorerModeSwitchProbe;
  const result = {
    events: probe?.events ? [...probe.events] : [],
    state: probe?.readState?.() ?? null,
  };
  probe?.observer?.disconnect?.();
  window.__conductorExplorerModeSwitchProbe = null;
  return result;
});

const countEvents = (events) => {
  const result = {
    attribute: 0,
    childList: 0,
    addedBadge: 0,
    removedBadge: 0,
    addedFileItem: 0,
    removedFileItem: 0,
    addedRow: 0,
    removedRow: 0,
  };
  for (const event of events ?? []) {
    if (event.type === "attributes") {
      result.attribute += 1;
      continue;
    }
    if (event.type !== "childList") {
      continue;
    }
    result.childList += 1;
    result.addedBadge += event.added?.badgeCount ?? 0;
    result.removedBadge += event.removed?.badgeCount ?? 0;
    result.addedFileItem += event.added?.fileItemCount ?? 0;
    result.removedFileItem += event.removed?.fileItemCount ?? 0;
    result.addedRow += event.added?.rowCount ?? 0;
    result.removedRow += event.removed?.rowCount ?? 0;
  }
  return result;
};
