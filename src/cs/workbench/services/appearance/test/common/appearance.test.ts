/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import {
  DEFAULT_EXPLORER_APPEARANCE,
  getWorkbenchAppearanceSnapshot,
} from "src/cs/workbench/services/appearance/common/appearance";

suite("workbench/services/appearance/common/appearance", () => {
  test("normalizes Explorer appearance settings", () => {
    assert.deepStrictEqual(getWorkbenchAppearanceSnapshot({
      filesExplorerDensity: "comfortable",
      filesExplorerShowBadges: false,
    }).explorer, {
      actionSize: 26,
      badgeFontSize: 11,
      badgeLineHeight: 16,
      density: "comfortable",
      fontSize: 13,
      rowHeight: 30,
      showBadges: false,
    });
  });

  test("falls back invalid Explorer appearance settings", () => {
    assert.deepStrictEqual(getWorkbenchAppearanceSnapshot({
      filesExplorerDensity: "wide",
      filesExplorerShowBadges: "false",
    }).explorer, DEFAULT_EXPLORER_APPEARANCE);
  });
});
