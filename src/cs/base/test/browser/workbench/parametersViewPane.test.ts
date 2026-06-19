/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { Event } from "src/cs/base/common/event";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import { ParametersViewPane } from "src/cs/workbench/contrib/parameters/browser/parametersViewPane";
import type { ParametersViewOptions } from "src/cs/workbench/contrib/parameters/browser/parametersView";
import type { INotificationService } from "src/cs/workbench/services/notification/common/notificationService";
import type { ParametersViewState } from "src/cs/workbench/services/parameters/common/parameterModel";
import type { IParametersService } from "src/cs/workbench/services/parameters/common/parameters";

suite("base/browser/workbench/parametersViewPane", () => {
  ensureNoDisposablesAreLeakedInTestSuite();

  test("keeps parameter table shell mounted when the render signature is unchanged", async () => {
    if (typeof document === "undefined") {
      return;
    }

    const pane = createParametersViewPane(createParametersOptions());
    const content = pane.element.querySelector(".parameters_view_content") as HTMLElement | null;
    const tableScroll = pane.element.querySelector(".parameters_table_scroll") as HTMLElement | null;
    assert.ok(content);
    assert.ok(tableScroll);

    const tableRoot = content.firstElementChild;
    const table = tableScroll.firstElementChild;
    assert.ok(tableRoot);
    assert.ok(table);

    const contentMutations = observeChildMutations(content);
    const tableMutations = observeChildMutations(tableScroll);

    try {
      pane.renderParameters(createParametersOptions());
      await Promise.resolve();

      assert.equal(contentMutations.records.length, 0);
      assert.equal(tableMutations.records.length, 0);
      assert.equal(content.firstElementChild, tableRoot);
      assert.equal(tableScroll.firstElementChild, table);
    } finally {
      contentMutations.disconnect();
      tableMutations.disconnect();
      pane.dispose();
    }
  });

  test("rerenders only the table body host when parameter content changes", async () => {
    if (typeof document === "undefined") {
      return;
    }

    const pane = createParametersViewPane(createParametersOptions());
    const content = pane.element.querySelector(".parameters_view_content") as HTMLElement | null;
    const tableScroll = pane.element.querySelector(".parameters_table_scroll") as HTMLElement | null;
    assert.ok(content);
    assert.ok(tableScroll);

    const tableRoot = content.firstElementChild;
    const table = tableScroll.firstElementChild;
    assert.ok(tableRoot);
    assert.ok(table);

    const contentMutations = observeChildMutations(content);
    const tableMutations = observeChildMutations(tableScroll);

    try {
      pane.renderParameters(createParametersOptions({ ion: 42 }));
      await Promise.resolve();

      assert.equal(contentMutations.records.length, 0);
      assert.ok(tableMutations.records.length > 0);
      assert.equal(content.firstElementChild, tableRoot);
      assert.ok(tableScroll.firstElementChild !== table);
    } finally {
      contentMutations.disconnect();
      tableMutations.disconnect();
      pane.dispose();
    }
  });

  test("includes rendered tooltip text in the parameter table signature", async () => {
    if (typeof document === "undefined") {
      return;
    }

    const pane = createParametersViewPane(createParametersOptions({
      buildCurrentTooltip: () => "first tooltip",
    }));
    const tableScroll = pane.element.querySelector(".parameters_table_scroll") as HTMLElement | null;
    assert.ok(tableScroll);
    const table = tableScroll.firstElementChild;
    assert.ok(table);

    const tableMutations = observeChildMutations(tableScroll);

    try {
      pane.renderParameters(createParametersOptions({
        buildCurrentTooltip: () => "second tooltip",
      }));
      await Promise.resolve();

      assert.ok(tableMutations.records.length > 0);
      assert.ok(tableScroll.firstElementChild !== table);
    } finally {
      tableMutations.disconnect();
      pane.dispose();
    }
  });
});

const createParametersViewPane = (
  options: ParametersViewOptions,
): ParametersViewPane => new ParametersViewPane(
  {
    onDidChangeParametersViewState: Event.None,
    getViewState: (): ParametersViewState => ({
      kind: "table",
      ...options,
    }),
  } as unknown as IParametersService,
  {
    notify: () => ({ dispose: () => undefined }),
  } as unknown as INotificationService,
);

const createParametersOptions = (
  overrides: Partial<ParametersViewOptions["rows"][number]> &
    Pick<Partial<ParametersViewOptions>, "buildCurrentTooltip" | "buildSsTooltip"> = {},
): ParametersViewOptions => {
  const {
    buildCurrentTooltip,
    buildSsTooltip,
    ...rowOverrides
  } = overrides;

  return {
    buildCurrentTooltip,
    buildSsTooltip,
    gmMetricHeader: "gm",
    rows: [{
      gmMaxAbs: 6,
      id: "series-a",
      ion: 1,
      ionIoff: 5,
      ioff: 3,
      jon: 13,
      legendHeader: "Series",
      name: "A",
      ss: 11,
      ssConfidence: "high",
      thresholdVoltage: 8,
      thresholdVoltageElectron: 9,
      thresholdVoltageHole: 10,
      xAtGmMaxAbs: 7,
      xAtIon: 2,
      xAtIoff: 4,
      xAtSs: 12,
      ...rowOverrides,
    }],
    showTransferMetrics: true,
  };
};

const observeChildMutations = (
  target: HTMLElement,
): {
  disconnect: () => void;
  records: MutationRecord[];
} => {
  const records: MutationRecord[] = [];
  const observer = new MutationObserver((mutations) => {
    records.push(...mutations.filter((mutation) => mutation.type === "childList"));
  });
  observer.observe(target, { childList: true });
  return {
    disconnect: () => observer.disconnect(),
    records,
  };
};
