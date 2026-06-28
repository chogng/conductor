import assert from "assert";

import { generateUuid, isUUID } from "src/cs/base/common/uuid";

suite("base/test/common/uuid", () => {
  test("generates valid uuid values", () => {
    const first = generateUuid();
    const second = generateUuid();

    assert.equal(isUUID(first), true);
    assert.equal(isUUID(second), true);
    assert.notEqual(first, second);
  });

  test("validates uuid values", () => {
    assert.equal(isUUID("not-a-uuid"), false);
  });
});
