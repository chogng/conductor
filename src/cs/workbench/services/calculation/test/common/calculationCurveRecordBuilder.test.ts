import assert from "assert";

import {
	createCalculatedCurveRecordsByFile,
	createCalculatedCurveRecordsInputSignature,
} from "src/cs/workbench/services/calculation/common/calculationCurveRecordBuilder";
import type {
	BaseCurveKey,
	DerivedCurveKey,
	FileRecord,
	SecondDerivedCurveKey,
} from "src/cs/workbench/services/session/common/sessionModel";

suite("workbench/services/calculation/test/common/calculationCurveRecordBuilder", () => {
	test("creates canonical derived and second-derived curves from base records", () => {
		const baseCurveKey = "base:iv:transfer:series-a" as BaseCurveKey;
		const gmCurveKey = "derived:gm:default:series-a" as DerivedCurveKey;
		const secondCurveKey = "secondDerived:secondDerivative:default:series-a" as SecondDerivedCurveKey;
		const recordsByFile = createCalculatedCurveRecordsByFile(
			{ "file-a": createFileRecord() },
			["file-a"],
		);
		const curvesByKey = Object.fromEntries(recordsByFile["file-a"].map(curve => [
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
					fileId: "file-a",
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
					fileId: "file-a",
					seriesId: "series-a",
					signature: curvesByKey[gmCurveKey]?.signature,
				},
			},
		);
	});

	test("input signature ignores calculated output generations", () => {
		const file = createFileRecord();
		const signature = createCalculatedCurveRecordsInputSignature(
			{ "file-a": file },
			["file-a"],
		);
		const withDerived: FileRecord = {
			...file,
			curvesByKey: {
				...file.curvesByKey,
				["derived:gm:default:series-a" as DerivedCurveKey]: {
					curveFamily: "gm",
					curveGeneration: "derived",
					fileId: "file-a",
					lineage: {
						curveGeneration: "derived",
						derivedFamily: "gm",
						inputCurve: {
							curveKey: "base:iv:transfer:series-a" as BaseCurveKey,
							fileId: "file-a",
							seriesId: "series-a",
							signature: "base-signature",
						},
					},
					points: [{ x: 0, y: 1 }],
					seriesId: "series-a",
					signature: "derived-signature",
				},
			},
		};

		assert.equal(
			createCalculatedCurveRecordsInputSignature({ "file-a": withDerived }, ["file-a"]),
			signature,
		);
	});
});

const createFileRecord = (): FileRecord => {
	const fileId = "file-a";
	const seriesId = "series-a";
	const curveKey = "base:iv:transfer:series-a" as BaseCurveKey;
	return {
		assessmentsByRawTableId: {},
		curvesByKey: {
			[curveKey]: {
				curveFamily: "iv",
				curveGeneration: "base",
				fileId,
				ivMode: "transfer",
				lineage: {
					baseFamily: "iv",
					baseSeries: { fileId, seriesId },
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
		id: fileId,
		kind: "unknown",
		latestTemplateRunId: "run-a",
		measurementBlockOrder: [],
		measurementBlocksById: {},
		metricsByKey: {},
		name: "file_a.csv",
		raw: {
			fileId,
			fileName: "file-a.csv",
			tableOrder: [],
			tablesById: {},
		},
		rawTableVersionsById: {},
		seriesById: {
			[seriesId]: {
				fileId,
				groupIndex: 0,
				id: seriesId,
				legendValue: "Vd=0.1",
				y: [1, 2, 4],
			},
		},
		seriesOrder: [seriesId],
		templateRunsById: {
			"run-a": {
				appliedAt: 1,
				config: {
					bottomTitle: "Gate Voltage",
					leftTitle: "Drain Current",
					stopOnError: false,
					xDataEnd: 2,
					xDataStart: 0,
					xSegmentationMode: "auto",
					xUnit: "V",
					yColumns: [1],
					yLegendTarget: "auto",
					yUnit: "A",
				},
				configFingerprint: "config-a",
				errors: [],
				fileId,
				id: "run-a",
				mode: "auto",
				outputCurveKeys: [curveKey],
				outputSeriesIds: [seriesId],
				selection: { kind: "auto" },
				sourceBlockIds: [],
				warnings: [],
			},
		},
	};
};
