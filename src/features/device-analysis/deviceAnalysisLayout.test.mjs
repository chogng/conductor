import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_DEVICE_ANALYSIS_SIDEBAR_WIDTH_PX,
  DEVICE_ANALYSIS_TEMPLATE_TRANSFER_STACK_THRESHOLD_PX,
  MAX_DEVICE_ANALYSIS_SIDEBAR_WIDTH_PX,
  MIN_DEVICE_ANALYSIS_SIDEBAR_WIDTH_PX,
  shouldStackTemplateTransferButtons,
} from "./deviceAnalysisLayout.ts";

test("sidebar width constants remain in a valid order", () => {
  assert.ok(MIN_DEVICE_ANALYSIS_SIDEBAR_WIDTH_PX < DEFAULT_DEVICE_ANALYSIS_SIDEBAR_WIDTH_PX);
  assert.ok(DEFAULT_DEVICE_ANALYSIS_SIDEBAR_WIDTH_PX < MAX_DEVICE_ANALYSIS_SIDEBAR_WIDTH_PX);
});

test("shouldStackTemplateTransferButtons stacks below threshold only", () => {
  assert.equal(shouldStackTemplateTransferButtons(undefined), false);
  assert.equal(shouldStackTemplateTransferButtons(null), false);
  assert.equal(shouldStackTemplateTransferButtons(Number.NaN), false);

  assert.equal(
    shouldStackTemplateTransferButtons(
      DEVICE_ANALYSIS_TEMPLATE_TRANSFER_STACK_THRESHOLD_PX - 1,
    ),
    true,
  );
  assert.equal(
    shouldStackTemplateTransferButtons(
      DEVICE_ANALYSIS_TEMPLATE_TRANSFER_STACK_THRESHOLD_PX,
    ),
    false,
  );
  assert.equal(
    shouldStackTemplateTransferButtons(
      DEVICE_ANALYSIS_TEMPLATE_TRANSFER_STACK_THRESHOLD_PX + 1,
    ),
    false,
  );
});

