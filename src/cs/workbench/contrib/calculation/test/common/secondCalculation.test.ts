import assert from "assert";

import {
  createSecondDerivativeResult,
  calculateSecondDerivativePoints,
} from "../../common/secondCalculation.ts";

suite("workbench/contrib/calculation/test/common/secondCalculation", () => {
  test("calculateSecondDerivativePoints derives from first calculation points", () => {
    const points = calculateSecondDerivativePoints([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 4 },
    ]);

    assert.deepEqual(
      points.map((point) => point.y),
      [1, 2, 3],
    );
  });

  test("createSecondDerivativeResult marks the source calculation kind", () => {
    const result = createSecondDerivativeResult({
      fileId: "file-a",
      inputKind: "gm",
      points: [
        { x: 0, y: 1 },
        { x: 1, y: 2 },
      ],
    });

    assert.equal(result.kind, "secondDerivative");
    assert.deepEqual(result.source, { fileId: "file-a", inputKind: "gm" });
  });
});
