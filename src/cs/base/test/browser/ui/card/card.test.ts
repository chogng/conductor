import assert from "assert";

import { getCardClassName } from "../../../../browser/ui/card/card.ts";

suite("base/test/browser/ui/card/card", () => {
  test("getCardClassName resolves variants and caller class names", () => {
    assert.equal(getCardClassName(), "card");
    assert.equal(getCardClassName({ variant: "panel" }), "card card--panel");
    assert.equal(getCardClassName({ variant: "glass", className: "extra" }), "card card--glass extra");
    assert.equal(getCardClassName({ variant: "flat" }), "card card--flat");
    assert.equal(getCardClassName({ variant: "fill" }), "card card--fill");
  });
});
