const titlebarTableButtonSelector = "#workbench-titlebar-table-button";
const tableViewSelector = ".table_view";
const tableViewportSelector = ".table_view_preview.scrollAreaViewport";
const tableBodyCellSelector = ".table_view_grid td.table_view_cell[data-row-index][data-col-index]";
const columnResizeHandleSelector = ".table_view_column_resize_handle[data-col-index]";

const DEFAULT_SETTLE_MS = 80;

export const runTableInteractionProbe = async ({
  page,
  resizeCount = 2,
  resizeDeltaPx = 48,
  selectionCount = 6,
  scrollCount = 8,
  scrollDeltaX = 320,
  scrollDeltaY = 560,
  settleMs = DEFAULT_SETTLE_MS,
  timeoutMs,
}) => {
  await switchToTableView(page, timeoutMs);
  const initialState = await waitForTableInteractionReady(page, timeoutMs);
  const scroll = await runTableScrollStress({
    count: scrollCount,
    deltaX: scrollDeltaX,
    deltaY: scrollDeltaY,
    page,
    settleMs,
  });
  const selection = await runTableRangeSelectionStress({
    count: selectionCount,
    page,
    settleMs,
  });
  const resize = await runTableColumnResizeStress({
    count: resizeCount,
    deltaPx: resizeDeltaPx,
    page,
    settleMs,
  });
  const finalState = await readTableInteractionState(page);
  return {
    finalState,
    initialState,
    resize,
    selection,
    scroll,
  };
};

const switchToTableView = async (page, timeoutMs) => {
  await page.locator(titlebarTableButtonSelector).waitFor({ timeout: Math.min(timeoutMs, 30000) });
  await page.locator(titlebarTableButtonSelector).click();
  await page.waitForFunction((selector) => {
    const element = document.querySelector(selector);
    return element instanceof HTMLElement && element.getClientRects().length > 0;
  }, tableViewSelector, { timeout: Math.min(timeoutMs, 30000) });
};

const waitForTableInteractionReady = async (page, timeoutMs) => {
  await page.waitForFunction(({ handleSelector, viewportSelector }) => {
    const viewport = document.querySelector(viewportSelector);
    const handle = document.querySelector(handleSelector);
    return viewport instanceof HTMLElement &&
      handle instanceof HTMLElement &&
      viewport.getClientRects().length > 0;
  }, {
    handleSelector: columnResizeHandleSelector,
    viewportSelector: tableViewportSelector,
  }, { timeout: Math.min(timeoutMs, 30000) });

  return readTableInteractionState(page);
};

const runTableScrollStress = async ({
  count,
  deltaX,
  deltaY,
  page,
  settleMs,
}) => {
  const samples = [];
  for (let index = 0; index < count; index += 1) {
    const sample = await page.evaluate(({ horizontalStep, selector, stepIndex, verticalStep }) => {
      const readViewportState = viewport => ({
        clientHeight: viewport.clientHeight,
        clientWidth: viewport.clientWidth,
        maxScrollLeft: Math.max(0, viewport.scrollWidth - viewport.clientWidth),
        maxScrollTop: Math.max(0, viewport.scrollHeight - viewport.clientHeight),
        scrollHeight: viewport.scrollHeight,
        scrollLeft: viewport.scrollLeft,
        scrollTop: viewport.scrollTop,
        scrollWidth: viewport.scrollWidth,
      });
      const resolveNextScrollPosition = (current, max, delta) => {
        if (max <= 0) {
          return current;
        }

        if (current >= max - 1) {
          return 0;
        }

        return Math.max(0, Math.min(max, current + delta));
      };
      const viewport = document.querySelector(selector);
      if (!(viewport instanceof HTMLElement)) {
        return {
          didScroll: false,
          reason: "missing-viewport",
        };
      }

      const before = readViewportState(viewport);
      const nextTop = resolveNextScrollPosition(before.scrollTop, before.maxScrollTop, verticalStep);
      const nextLeft = stepIndex % 3 === 2
        ? resolveNextScrollPosition(before.scrollLeft, before.maxScrollLeft, horizontalStep)
        : before.scrollLeft;
      viewport.scrollTop = nextTop;
      viewport.scrollLeft = nextLeft;
      viewport.dispatchEvent(new Event("scroll", { bubbles: true }));
      const after = readViewportState(viewport);
      return {
        after,
        before,
        didScroll: Math.abs(after.scrollTop - before.scrollTop) > 0.5 ||
          Math.abs(after.scrollLeft - before.scrollLeft) > 0.5,
      };
    }, {
      horizontalStep: deltaX,
      selector: tableViewportSelector,
      stepIndex: index,
      verticalStep: deltaY,
    });
    samples.push(sample);
    await page.waitForTimeout(settleMs);
  }

  return {
    changedCount: samples.filter(sample => sample.didScroll).length,
    requestedCount: count,
    samples,
  };
};

const runTableRangeSelectionStress = async ({
  count,
  page,
  settleMs,
}) => {
  const plan = await page.evaluate(({ selector, stepCount, viewportSelector }) => {
    const viewport = document.querySelector(viewportSelector);
    const viewportRect = viewport instanceof HTMLElement
      ? viewport.getBoundingClientRect()
      : null;
    const cells = [...document.querySelectorAll(selector)]
      .filter(cell => cell instanceof HTMLTableCellElement)
      .map(cell => {
        const rect = cell.getBoundingClientRect();
        return {
          cell,
          colIndex: Number(cell.dataset.colIndex),
          rect,
          rowIndex: Number(cell.dataset.rowIndex),
        };
      })
      .filter(descriptor => {
        if (
          !Number.isInteger(descriptor.rowIndex) ||
          !Number.isInteger(descriptor.colIndex) ||
          descriptor.rect.width <= 0 ||
          descriptor.rect.height <= 0 ||
          descriptor.cell.hidden
        ) {
          return false;
        }

        if (!viewportRect) {
          return true;
        }

        const centerX = descriptor.rect.left + descriptor.rect.width / 2;
        const centerY = descriptor.rect.top + descriptor.rect.height / 2;
        return centerX >= viewportRect.left &&
          centerX <= viewportRect.right &&
          centerY >= viewportRect.top &&
          centerY <= viewportRect.bottom;
      });
    const rows = [...new Set(cells.map(descriptor => descriptor.rowIndex))].sort((left, right) => left - right);
    const columns = [...new Set(cells.map(descriptor => descriptor.colIndex))].sort((left, right) => left - right);
    if (rows.length < 2 || columns.length < 2) {
      return {
        didSelect: false,
        reason: "not-enough-visible-cells",
        visibleColumnCount: columns.length,
        visibleRowCount: rows.length,
      };
    }

    const keyFor = (rowIndex, colIndex) => `${rowIndex}:${colIndex}`;
    const cellByPosition = new Map(cells.map(descriptor => [keyFor(descriptor.rowIndex, descriptor.colIndex), descriptor]));
    const resolveCell = (rowIndex, colIndex) =>
      cellByPosition.get(keyFor(rowIndex, colIndex)) ?? null;
    const centerOf = descriptor => ({
      x: descriptor.rect.left + descriptor.rect.width / 2,
      y: descriptor.rect.top + descriptor.rect.height / 2,
    });
    const anchor = resolveCell(rows[0], columns[0]);
    if (!anchor) {
      return {
        didSelect: false,
        reason: "missing-anchor-cell",
        visibleColumnCount: columns.length,
        visibleRowCount: rows.length,
      };
    }

    const targets = [];
    for (let index = 0; index < stepCount; index += 1) {
      const rowIndex = rows[Math.min(index + 1, rows.length - 1)];
      const colIndex = columns[Math.min(1 + Math.floor(index / 2), columns.length - 1)];
      const target = resolveCell(rowIndex, colIndex);
      if (!target) {
        targets.push({
          colIndex,
          reason: "missing-target-cell",
          rowIndex,
        });
        continue;
      }

      targets.push({
        colIndex,
        point: centerOf(target),
        rowIndex,
      });
    }

    return {
      anchor: {
        colIndex: anchor.colIndex,
        point: centerOf(anchor),
        rowIndex: anchor.rowIndex,
      },
      targets,
      visibleColumnCount: columns.length,
      visibleRowCount: rows.length,
    };
  }, {
    selector: tableBodyCellSelector,
    stepCount: count,
    viewportSelector: tableViewportSelector,
  });

  if (!plan.anchor?.point || !Array.isArray(plan.targets) || plan.targets.length === 0) {
    return {
      requestedCount: count,
      selectedCount: 0,
      state: await readTableInteractionState(page),
      ...plan,
    };
  }

  const samples = [];
  await page.mouse.move(plan.anchor.point.x, plan.anchor.point.y);
  await page.mouse.down();
  for (const target of plan.targets) {
    if (!target.point) {
      samples.push({
        ...target,
        didMove: false,
      });
      continue;
    }

    await page.mouse.move(target.point.x, target.point.y);
    await page.waitForTimeout(Math.max(16, Math.min(40, settleMs)));
    samples.push({
      ...target,
      didMove: true,
      ...(await readTableSelectionDomState(page)),
    });
  }
  await page.mouse.up();
  await page.waitForTimeout(settleMs);

  return {
    requestedCount: count,
    selectedCount: samples.filter(sample => sample.didMove).length,
    state: await readTableInteractionState(page),
    ...plan,
    didSelect: samples.some(sample => sample.didMove && sample.selectedCellCount > 1),
    samples,
  };
};

const readTableSelectionDomState = async (page) => page.evaluate((selector) => ({
  selectedCellCount: document.querySelectorAll(`${selector}[data-selected="true"]`).length,
  selectionFrameCellCount: document.querySelectorAll(`${selector}[data-selection-frame="true"]`).length,
}), tableBodyCellSelector);

const runTableColumnResizeStress = async ({
  count,
  deltaPx,
  page,
  settleMs,
}) => {
  const samples = [];
  for (let index = 0; index < count; index += 1) {
    const delta = index % 2 === 0 ? deltaPx : -Math.round(deltaPx / 2);
    const sample = await page.evaluate(({ delta, handleIndex, selector }) => {
      const handles = [...document.querySelectorAll(selector)]
        .filter(handle => handle instanceof HTMLElement);
      if (!handles.length) {
        return {
          didResize: false,
          reason: "missing-resize-handle",
        };
      }

      const handle = handles[Math.min(handleIndex, handles.length - 1)];
      const rect = handle.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        return {
          didResize: false,
          handleCount: handles.length,
          reason: "missing-resize-handle-box",
        };
      }

      const startX = rect.right - 1;
      const startY = rect.top + rect.height / 2;
      const pointerBase = {
        bubbles: true,
        cancelable: true,
        clientY: startY,
        isPrimary: true,
        pointerId: 1,
        pointerType: "mouse",
      };
      const pointerDown = new PointerEvent("pointerdown", {
        ...pointerBase,
        button: 0,
        buttons: 1,
        clientX: startX,
      });
      const accepted = !handle.dispatchEvent(pointerDown);
      const targetWindow = handle.ownerDocument.defaultView ?? window;
      for (let step = 1; step <= 4; step += 1) {
        targetWindow.dispatchEvent(new PointerEvent("pointermove", {
          ...pointerBase,
          button: 0,
          buttons: 1,
          clientX: startX + (delta * step / 4),
        }));
      }
      targetWindow.dispatchEvent(new PointerEvent("pointerup", {
        ...pointerBase,
        button: 0,
        buttons: 0,
        clientX: startX + delta,
      }));
      return {
        accepted,
        colIndex: Number(handle.dataset.colIndex),
        deltaPx: delta,
        didResize: true,
        handleCount: handles.length,
      };
    }, {
      delta,
      handleIndex: index,
      selector: columnResizeHandleSelector,
    });
    await page.waitForTimeout(settleMs);
    samples.push({
      ...sample,
      state: await readTableInteractionState(page),
    });
  }

  return {
    requestedCount: count,
    resizedCount: samples.filter(sample => sample.didResize).length,
    samples,
  };
};

const readTableInteractionState = async (page) => page.evaluate(({
  handleSelector,
  viewportSelector,
}) => {
  const readViewportState = viewport => ({
    clientHeight: viewport.clientHeight,
    clientWidth: viewport.clientWidth,
    maxScrollLeft: Math.max(0, viewport.scrollWidth - viewport.clientWidth),
    maxScrollTop: Math.max(0, viewport.scrollHeight - viewport.clientHeight),
    scrollHeight: viewport.scrollHeight,
    scrollLeft: viewport.scrollLeft,
    scrollTop: viewport.scrollTop,
    scrollWidth: viewport.scrollWidth,
  });
  const viewport = document.querySelector(viewportSelector);
  const handles = [...document.querySelectorAll(handleSelector)]
    .filter(handle => handle instanceof HTMLElement);
  return {
    bodyCellCount: document.querySelectorAll(".table_view_grid td.table_view_cell").length,
    headerCellCount: document.querySelectorAll(".table_view_grid_header_cell").length,
    resizeHandleCount: handles.length,
    resizeHandleColumns: handles.map(handle => Number(handle.dataset.colIndex)).filter(Number.isFinite),
    viewport: viewport instanceof HTMLElement ? readViewportState(viewport) : null,
  };
}, {
  handleSelector: columnResizeHandleSelector,
  viewportSelector: tableViewportSelector,
});
