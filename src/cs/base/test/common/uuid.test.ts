import assert from "assert";

import { generateUuid, isUUID, prefixedUuid } from "src/cs/base/common/uuid";

suite("base/test/common/uuid", () => {
  test("generates valid uuid values", () => {
    const first = generateUuid();
    const second = generateUuid();

    assert.equal(isUUID(first), true);
    assert.equal(isUUID(second), true);
    assert.notEqual(first, second);
  });

  test("validates and prefixes uuid values", () => {
    assert.equal(isUUID("not-a-uuid"), false);

    const prefixed = prefixedUuid("dat");
    assert.equal(prefixed.startsWith("dat-"), true);
    assert.equal(isUUID(prefixed.slice(4)), true);
  });
});
