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
  const rootSelectors = [
    ["fileList", ".file-list"],
    ["fileListViewport", ".file-list-viewport"],
    ["treeRoot", ".file-list-tree-root"],
    ["objectTree", ".ui-tree.file-list-tree"],
    ["treeList", ".ui-list.ui-tree__list"],
    ["listViewport", ".ui-list__viewport.file-list-tree-viewport"],
    ["listStage", ".ui-list__stage"],
    ["thumbnailGrid", ".file-list-thumbnail-grid"],
  ];
  const rowSelector = ".ui-list__row";
  const fileItemSelector = ".file-list-item";
  const badgeSelector = ".file-list-item-table-facts";
  const trackedSelector = [
    ...rootSelectors.map(([, selector]) => selector),
    rowSelector,
    fileItemSelector,
    badgeSelector,
  ].join(",");

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
    for (const node of document.querySelectorAll(trackedSelector)) {
      ensureNodeId(node);
    }
  };
  const readState = () => {
    seedNodes();
    const roots = Object.fromEntries(rootSelectors.map(([name, selector]) => {
      const node = document.querySelector(selector);
      return [name, node instanceof HTMLElement
        ? {
            childElementCount: node.childElementCount,
            className: node.className,
            hidden: node.hidden,
            isConnected: node.isConnected,
            nodeId: node.dataset.traceNodeId ?? null,
          }
        : null];
    }));
    const rows = [...document.querySelectorAll(rowSelector)]
      .filter(row => row instanceof HTMLElement);
    const fileItems = [...document.querySelectorAll(fileItemSelector)]
      .filter(item => item instanceof HTMLElement);
    const badges = [...document.querySelectorAll(badgeSelector)]
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
      rootNodeIds: Object.fromEntries(Object.entries(roots).map(([name, node]) => [
        name,
        node?.nodeId ?? null,
      ])),
      rootSignature: Object.entries(roots).map(([name, node]) => [
        name,
        node?.nodeId ?? "",
        node?.className ?? "",
        node?.childElementCount ?? "",
        node?.hidden ? "hidden" : "visible",
      ].join(":")).join("|"),
      roots,
      rowCount: rows.length,
      rowNodeIds: rows.map(row => row.dataset.traceNodeId ?? null),
      selectedFileId: document.querySelector(`${fileItemSelector}[data-selected='true']`)?.dataset.fileId ?? null,
      viewLayout: document.querySelector(".file-list-tree-root")?.dataset.viewLayout ?? null,
    };
  };

  seedNodes();
  const events = [];
  const summarizeNodes = (nodes) => {
    let badgeCount = 0;
    let fileItemCount = 0;
    let fileListCount = 0;
    let fileListViewportCount = 0;
    let listRootCount = 0;
    let objectTreeCount = 0;
    let rowCount = 0;
    let treeRootCount = 0;
    for (const node of nodes) {
      if (!(node instanceof HTMLElement)) {
        continue;
      }
      if (node.matches(badgeSelector) || node.querySelector(badgeSelector)) {
        badgeCount += 1;
      }
      if (node.matches(fileItemSelector) || node.querySelector(fileItemSelector)) {
        fileItemCount += 1;
      }
      if (node.matches(rowSelector) || node.querySelector(rowSelector)) {
        rowCount += 1;
      }
      if (node.matches(".file-list") || node.querySelector(".file-list")) {
        fileListCount += 1;
      }
      if (node.matches(".file-list-viewport") || node.querySelector(".file-list-viewport")) {
        fileListViewportCount += 1;
      }
      if (node.matches(".file-list-tree-root") || node.querySelector(".file-list-tree-root")) {
        treeRootCount += 1;
      }
      if (node.matches(".ui-tree.file-list-tree") || node.querySelector(".ui-tree.file-list-tree")) {
        objectTreeCount += 1;
      }
      if (node.matches(".ui-list.ui-tree__list") || node.querySelector(".ui-list.ui-tree__list")) {
        listRootCount += 1;
      }
    }
    return {
      badgeCount,
      fileItemCount,
      fileListCount,
      fileListViewportCount,
      listRootCount,
      objectTreeCount,
      rowCount,
      treeRootCount,
    };
  };
  const isInTrackedExplorerRoot = (node) => {
    if (!(node instanceof HTMLElement)) {
      return false;
    }
    return Boolean(
      node.matches(".file-list") ||
      node.closest(".file-list") ||
      node.querySelector(".file-list"),
    );
  };
  const hasTrackedMutation = (summary) => {
    return Boolean(
      summary.badgeCount ||
      summary.fileItemCount ||
      summary.fileListCount ||
      summary.fileListViewportCount ||
      summary.listRootCount ||
      summary.objectTreeCount ||
      summary.rowCount ||
      summary.treeRootCount
    );
  };
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      const targetNode = mutation.target instanceof HTMLElement ? mutation.target : null;
      if (mutation.type === "childList") {
        const added = summarizeNodes(mutation.addedNodes);
        const removed = summarizeNodes(mutation.removedNodes);
        if (!isInTrackedExplorerRoot(targetNode) && !hasTrackedMutation(added) && !hasTrackedMutation(removed)) {
          continue;
        }
        events.push({
          added,
          removed,
          targetClass: targetNode?.className ?? null,
          targetTraceNodeId: targetNode?.dataset.traceNodeId ?? null,
          type: "childList",
        });
      } else if (mutation.type === "attributes") {
        if (!isInTrackedExplorerRoot(targetNode)) {
          continue;
        }
        events.push({
          attributeName: mutation.attributeName,
          fileId: targetNode?.closest(".file-list-item")?.dataset.fileId ?? null,
          nodeClass: targetNode?.className ?? null,
          traceNodeId: targetNode?.dataset.traceNodeId ?? null,
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
    addedFileList: 0,
    removedFileList: 0,
    addedFileListViewport: 0,
    removedFileListViewport: 0,
    addedListRoot: 0,
    removedListRoot: 0,
    addedObjectTree: 0,
    removedObjectTree: 0,
    addedRow: 0,
    removedRow: 0,
    addedTreeRoot: 0,
    removedTreeRoot: 0,
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
    result.addedFileList += event.added?.fileListCount ?? 0;
    result.removedFileList += event.removed?.fileListCount ?? 0;
    result.addedFileListViewport += event.added?.fileListViewportCount ?? 0;
    result.removedFileListViewport += event.removed?.fileListViewportCount ?? 0;
    result.addedListRoot += event.added?.listRootCount ?? 0;
    result.removedListRoot += event.removed?.listRootCount ?? 0;
    result.addedObjectTree += event.added?.objectTreeCount ?? 0;
    result.removedObjectTree += event.removed?.objectTreeCount ?? 0;
    result.addedRow += event.added?.rowCount ?? 0;
    result.removedRow += event.removed?.rowCount ?? 0;
    result.addedTreeRoot += event.added?.treeRootCount ?? 0;
    result.removedTreeRoot += event.removed?.treeRootCount ?? 0;
  }
  return result;
};
