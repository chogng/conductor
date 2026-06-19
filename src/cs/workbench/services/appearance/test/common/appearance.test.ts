/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import {
  DEFAULT_EXPLORER_APPEARANCE,
  getWorkbenchAppearanceSnapshot,
} from "src/cs/workbench/services/appearance/common/appearance";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("workbench/services/appearance/common/appearance", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("normalizes Explorer appearance settings", () => {
    assert.deepStrictEqual(getWorkbenchAppearanceSnapshot({
      filesExplorerBadgeColors: {
        output: "blue",
        transfer: "green",
      },
      filesExplorerDensity: "comfortable",
      filesExplorerShowBadges: false,
    }).explorer, {
      actionSize: 26,
      badgeFontSize: 11,
      badgeColors: {
        cf: "cyan",
        cv: "purple",
        mixed: "neutral",
        output: "blue",
        pv: "red",
        transfer: "green",
        unknown: "orange",
      },
      badgeLineHeight: 16,
      density: "comfortable",
      fontSize: 13,
      rowHeight: 30,
      showBadges: false,
    });
  });

  test("falls back invalid Explorer appearance settings", () => {
    const invalidSettings = {
      filesExplorerBadgeColors: {
        output: "magenta",
      },
      filesExplorerDensity: "wide",
      filesExplorerShowBadges: "false",
    } as unknown as Parameters<typeof getWorkbenchAppearanceSnapshot>[0];

    assert.deepStrictEqual(
      getWorkbenchAppearanceSnapshot(invalidSettings).explorer,
      DEFAULT_EXPLORER_APPEARANCE,
    );
  });
});
