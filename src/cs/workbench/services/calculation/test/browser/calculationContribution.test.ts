/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { shouldUpdateCalculationForSessionChange } from "src/cs/workbench/services/calculation/browser/calculation.contribution";
import {
  createSessionChangeEvent,
  type SessionChangeReason,
} from "src/cs/workbench/services/session/common/sessionEvents";
import type { CurveKey } from "src/cs/workbench/services/session/common/sessionModel";

suite("workbench/services/calculation/test/browser/calculationContribution", () => {
  test("ignores session changes that do not affect calculated curve inputs", () => {
    for (const reason of [
      "rawTablesChanged",
      "assessmentChanged",
      "metricsChanged",
      "metricInputsChanged",
    ] satisfies SessionChangeReason[]) {
      assert.equal(
        shouldUpdateCalculationForSessionChange(createSessionChangeEvent(reason, 1)),
        false,
        reason,
      );
    }
  });

  test("updates for template, removal, and clear changes", () => {
    for (const reason of [
      "templateRunChanged",
      "filesRemoved",
      "sessionCleared",
    ] satisfies SessionChangeReason[]) {
      assert.equal(
        shouldUpdateCalculationForSessionChange(createSessionChangeEvent(reason, 1)),
        true,
        reason,
      );
    }
  });

  test("updates only for base curve changes", () => {
    assert.equal(
      shouldUpdateCalculationForSessionChange(createSessionChangeEvent("curvesChanged", 1, {
        curveKeys: ["base:iv:transfer:series-a" as CurveKey],
      })),
      true,
    );
    assert.equal(
      shouldUpdateCalculationForSessionChange(createSessionChangeEvent("curvesChanged", 1, {
        curveKeys: ["derived:gm:default:series-a" as CurveKey],
      })),
      false,
    );
    assert.equal(
      shouldUpdateCalculationForSessionChange(createSessionChangeEvent("curvesChanged", 1, {
        curveKeys: ["secondDerived:secondDerivative:default:series-a" as CurveKey],
      })),
      false,
    );
  });

  test("updates for curve replacement events without committed curve keys", () => {
    assert.equal(
      shouldUpdateCalculationForSessionChange(createSessionChangeEvent("curvesChanged", 1)),
      true,
    );
  });
});
