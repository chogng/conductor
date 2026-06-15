import assert from "assert";

import { TableColumnLayout } from "src/cs/workbench/services/table/common/tableColumnLayout";

suite("workbench/services/table/common/tableColumnLayout", () => {
	test("defines shared column width bounds", () => {
		assert.equal(TableColumnLayout.defaultWidth, 160);
		assert.equal(TableColumnLayout.minWidth, 0);
		assert.equal(TableColumnLayout.maxWidth, 640);
	});

	test("clamps and rounds column widths", () => {
		assert.equal(TableColumnLayout.clampWidth(-20), 0);
		assert.equal(TableColumnLayout.clampWidth(20), 20);
		assert.equal(TableColumnLayout.clampWidth(20.4), 20);
		assert.equal(TableColumnLayout.clampWidth(20.5), 21);
		assert.equal(TableColumnLayout.clampWidth(900), 640);
	});

	test("normalizes non-finite column widths", () => {
		assert.equal(TableColumnLayout.clampWidth(Number.NaN), 0);
		assert.equal(TableColumnLayout.clampWidth(Number.POSITIVE_INFINITY), 640);
		assert.equal(TableColumnLayout.clampWidth(Number.NEGATIVE_INFINITY), 0);
	});
});
