import assert from "assert";

import {
	createCalculatedCurveRecords,
	createCalculatedCurveRecordsInputSignature,
} from "src/cs/workbench/services/calculation/common/calculationCurveRecordBuilder";
import type {
	CalculationRecordsInput,
} from "src/cs/workbench/services/calculation/common/calculationRecords";
import type {
	BaseCurveKey,
	DerivedCurveKey,
	SecondDerivedCurveKey,
} from "src/cs/workbench/services/calculation/common/calculationRecords";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("workbench/services/calculation/test/common/calculationCurveRecordBuilder", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
	test("creates resource-neutral derived and second-derived curves from base records", () => {
		const baseCurveKey = "base:iv:transfer:series-a" as BaseCurveKey;
		const gmCurveKey = "derived:gm:default:series-a" as DerivedCurveKey;
		const secondCurveKey = "secondDerived:secondDerivative:default:series-a" as SecondDerivedCurveKey;
		const records = createCalculatedCurveRecords(
			createRecordsInput(),
		);
		const curvesByKey = Object.fromEntries(records.map(curve => [
			curve.curveGeneration === "derived"
				? `derived:${curve.curveFamily}:default:${curve.seriesId}`
				: `secondDerived:${curve.curveFamily}:default:${curve.seriesId}`,
			curve,
		]));

		assert.deepEqual(
			Object.keys(curvesByKey).sort(),
			[
				"derived:gm:default:series-a",
				"derived:localSs:default:series-a",
				"derived:thresholdFit:default:series-a",
				"secondDerived:secondDerivative:default:series-a",
			],
		);
		assert.deepEqual(
			curvesByKey[gmCurveKey]?.points.map(point => point.y),
			[1, 1.5, 2],
		);
		assert.deepEqual(
			curvesByKey[gmCurveKey]?.lineage,
			{
				curveGeneration: "derived",
				derivedFamily: "gm",
				inputCurve: {
					curveKey: baseCurveKey,
					seriesId: "series-a",
					signature: "base-signature",
				},
			},
		);
		assert.deepEqual(
			curvesByKey[secondCurveKey]?.points.map(point => point.y),
			[0.5, 0.5, 0.5],
		);
		assert.deepEqual(
			curvesByKey[secondCurveKey]?.lineage,
			{
				curveGeneration: "secondDerived",
				secondDerivedFamily: "secondDerivative",
				inputCurve: {
					curveKey: gmCurveKey,
					seriesId: "series-a",
					signature: curvesByKey[gmCurveKey]?.signature,
				},
			},
		);
	});

	test("input signature changes with base curve input", () => {
		const input = createRecordsInput();
		const signature = createCalculatedCurveRecordsInputSignature(input);
		const curveKey = "base:iv:transfer:series-a";
		const changed: CalculationRecordsInput = {
			...input,
			baseCurvesByKey: {
				...input.baseCurvesByKey,
				[curveKey]: {
					...input.baseCurvesByKey[curveKey],
					signature: "changed-base-signature",
				},
			},
		};

		assert.notEqual(
			createCalculatedCurveRecordsInputSignature(changed),
			signature,
		);
	});

	test("uses precomputed Rust analysis for gm and local SS curves", () => {
		const records = createCalculatedCurveRecords(
			createRecordsInput(),
			{
				"series-a": {
					gm: [{ x: 0.5, y: 42 }],
					ss: [{ x: 1, y: 84 }],
				},
			},
		);
		const gm = records.find(
			(record) => record.curveGeneration === "derived" &&
				record.curveFamily === "gm",
		);
		const ss = records.find(
			(record) => record.curveGeneration === "derived" &&
				record.curveFamily === "localSs",
		);
		const vth = records.find(
			(record) => record.curveGeneration === "derived" &&
				record.curveFamily === "thresholdFit",
		);

		assert.deepEqual(gm?.points, [{ x: 0.5, y: 42 }]);
		assert.deepEqual(ss?.points, [{ x: 1, y: 84 }]);
		assert.ok(vth?.points.length);
	});
});

const createRecordsInput = (): CalculationRecordsInput => {
	const seriesId = "series-a";
	const curveKey = "base:iv:transfer:series-a" as BaseCurveKey;
	return {
		axis: {
			xAxisRole: "vg",
			xLabel: "Gate Voltage",
			xUnit: "V",
			yLabel: "Drain Current",
			yUnit: "A",
		},
		baseCurvesByKey: {
			[curveKey]: {
				curveFamily: "iv",
				curveGeneration: "base",
				ivMode: "transfer",
				lineage: {
					baseFamily: "iv",
					baseSeries: { seriesId },
					curveGeneration: "base",
					ivMode: "transfer",
				},
				points: [
					{ x: 0, y: 1 },
					{ x: 1, y: 2 },
					{ x: 2, y: 4 },
				],
				domain: {
					x: [0, 2],
					y: [1, 4],
				},
				seriesId,
				signature: "base-signature",
			},
		},
		seriesById: {
			[seriesId]: {
				groupIndex: 0,
				id: seriesId,
				legendValue: "Vd=0.1",
				y: [1, 2, 4],
			},
		},
		seriesOrder: [seriesId],
	};
};
