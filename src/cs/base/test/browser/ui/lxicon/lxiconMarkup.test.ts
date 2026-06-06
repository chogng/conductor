import assert from "assert";

import { normalizeLxIconSvgMarkup } from "../../../../browser/ui/lxicon/lxiconMarkup.ts";
import type { LxIconDefinition } from "../../../../browser/ui/lxicon/lxiconMarkup.ts";

suite("base/test/browser/ui/lxicon/lxiconMarkup", () => {
  test("normalizeLxIconSvgMarkup normalizes size, accessibility and color", () => {
    const icon: LxIconDefinition = () =>
      '<svg width="16" height="16"><path fill="#000" stroke="black"/></svg>';

    assert.equal(
      normalizeLxIconSvgMarkup(icon),
      '<svg width="100%" height="100%" focusable="false" aria-hidden="true"><path fill="currentColor" stroke="currentColor"/></svg>',
    );
  });
});
