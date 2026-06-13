import assert from "assert";

import {
  executeCalculation,
  getCalculationDescriptor,
  type CalculationKind,
} from "../../common/calculationExecutor.ts";

suite("workbench/services/calculation/test/common/calculationExecutor", () => {
  test("resolves calculation descriptors by kind", () => {
    const kinds: CalculationKind[] = ["iv", "gm", "ss", "vth"];

    assert.deepEqual(
      kinds.map(kind =>
        getCalculationDescriptor(kind).algorithmId
      ),
      [
        "base.identity",
        "gm.centralDerivative",
        "ss.subthresholdSwing",
        "vth.sqrtCurrent",
      ],
    );
  });

  test("executes the selected calculation algorithm", () => {
    assert.deepEqual(
      executeCalculation({
        kind: "gm",
        points: [
          { x: 0, y: 1 },
          { x: 1, y: 2 },
          { x: 2, y: 4 },
        ],
      }).map(point => point.y),
      [1, 1.5, 2],
    );
    assert.deepEqual(
      executeCalculation({
        kind: "vth",
        points: [
          { x: 0, y: -4 },
          { x: 1, y: 9 },
        ],
      }),
      [
        { x: 0, y: 2 },
        { x: 1, y: 3 },
      ],
    );
  });
});
