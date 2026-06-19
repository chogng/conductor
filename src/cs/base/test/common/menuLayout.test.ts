import assert from "assert";

import { calculateSubmenuLayout } from "src/cs/base/browser/ui/menu/menu";

suite("base/test/common/menuLayout", () => {
  test("lays out submenus flush against the parent item", () => {
    assert.deepEqual(
      calculateSubmenuLayout(
        {
          left: 100,
          right: 220,
          top: 40,
        },
        {
          height: 120,
          width: 140,
        },
        {
          height: 800,
          width: 500,
        },
      ),
      {
        left: 220,
        top: 40,
      },
    );
  });

  test("flips submenus left without introducing a hover gap", () => {
    assert.deepEqual(
      calculateSubmenuLayout(
        {
          left: 300,
          right: 420,
          top: 780,
        },
        {
          height: 120,
          width: 140,
        },
        {
          height: 800,
          width: 500,
        },
      ),
      {
        left: 160,
        top: 680,
      },
    );
  });
});
