import assert from "assert";

import { MarshalledId } from "../../common/marshallingIds.ts";
import {
  reviveIncomingMarshalledValue,
  transformOutgoingMarshalledValue,
} from "../../common/marshalling.ts";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("base/test/common/marshalling", () => {
  ensureNoDisposablesAreLeakedInTestSuite();

  test("marshals Uint8Array values through JSON", () => {
    const marshalled = transformOutgoingMarshalledValue(new Uint8Array([82, 101, 112, 101, 97, 116]));
    const raw = JSON.parse(JSON.stringify(marshalled));

    assert.equal(raw.$mid, MarshalledId.Uint8Array);
    assert.deepEqual(raw.bytes, [82, 101, 112, 101, 97, 116]);

    const revived = reviveIncomingMarshalledValue(raw);
    assert.equal(revived instanceof Uint8Array, true);
    assert.equal(new TextDecoder().decode(revived as Uint8Array), "Repeat");
  });
});
