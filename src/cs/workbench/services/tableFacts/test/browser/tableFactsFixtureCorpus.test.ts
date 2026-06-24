/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import { RawTableFactsService } from "src/cs/workbench/services/tableFacts/browser/rawTableFactsService";
import type {
	RawTableFactsRecord,
} from "src/cs/workbench/services/tableFacts/common/tableFacts";
import type {
	LayoutBindingDraft,
	LayoutKind,
} from "src/cs/workbench/services/tableFacts/common/layoutCandidate";
import type {
	MeasurementFamily,
	IvSweepMode,
} from "src/cs/workbench/services/tableFacts/common/measurement";
import type {
	EvidenceSource,
} from "src/cs/workbench/services/tableFacts/common/semanticCandidate";
import type {
	SchemaProfile,
} from "src/cs/workbench/services/schemaProfile/common/schemaProfile";

import ch1Ch2GroupedSweepExpected from "../fixtures/ch1-ch2/grouped-sweep/expected.json";
import ch1Ch2GroupedSweepRows from "../fixtures/ch1-ch2/grouped-sweep/rows.json";
import cfExpected from "../fixtures/cf/expected.json";
import cfRows from "../fixtures/cf/rows.json";
import cvExpected from "../fixtures/cv/expected.json";
import cvRows from "../fixtures/cv/rows.json";
import encodingReplacementCharacterExpected from "../fixtures/encoding/replacement-character/expected.json";
import encodingReplacementCharacterRows from "../fixtures/encoding/replacement-character/rows.json";
import ivOutputExpected from "../fixtures/iv-output/expected.json";
import ivOutputRows from "../fixtures/iv-output/rows.json";
import ivTransferExpected from "../fixtures/iv-transfer/expected.json";
import ivTransferRows from "../fixtures/iv-transfer/rows.json";
import malformedNoNumericDataExpected from "../fixtures/malformed/no-numeric-data/expected.json";
import malformedNoNumericDataRows from "../fixtures/malformed/no-numeric-data/rows.json";
import multiBlockRepeatedDataNameExpected from "../fixtures/multi-block/repeated-dataname/expected.json";
import multiBlockRepeatedDataNameRows from "../fixtures/multi-block/repeated-dataname/rows.json";
import pvExpected from "../fixtures/pv/expected.json";
import pvRows from "../fixtures/pv/rows.json";
import schemaProfileColumnOrderMismatchExpected from "../fixtures/schema-profile/column-order-mismatch/expected.json";
import schemaProfileColumnOrderMismatchProfiles from "../fixtures/schema-profile/column-order-mismatch/schemaProfiles.json";
import schemaProfileColumnOrderMismatchRows from "../fixtures/schema-profile/column-order-mismatch/rows.json";
import schemaProfileConfirmedFamilyExpected from "../fixtures/schema-profile/confirmed-family/expected.json";
import schemaProfileConfirmedFamilyProfiles from "../fixtures/schema-profile/confirmed-family/schemaProfiles.json";
import schemaProfileConfirmedFamilyRows from "../fixtures/schema-profile/confirmed-family/rows.json";
import schemaProfileExactMatchExpected from "../fixtures/schema-profile/exact-match/expected.json";
import schemaProfileExactMatchProfiles from "../fixtures/schema-profile/exact-match/schemaProfiles.json";
import schemaProfileExactMatchRows from "../fixtures/schema-profile/exact-match/rows.json";
import schemaProfileGenericVoltageCurrentExpected from "../fixtures/schema-profile/generic-voltage-current/expected.json";
import schemaProfileGenericVoltageCurrentProfiles from "../fixtures/schema-profile/generic-voltage-current/schemaProfiles.json";
import schemaProfileGenericVoltageCurrentRows from "../fixtures/schema-profile/generic-voltage-current/rows.json";
import pairwiseXyExpected from "../fixtures/unknown/pairwise-xy/expected.json";
import pairwiseXyRows from "../fixtures/unknown/pairwise-xy/rows.json";
import timeSeriesExpected from "../fixtures/unknown/time-series/expected.json";
import timeSeriesRows from "../fixtures/unknown/time-series/rows.json";
import wideMatrixExpected from "../fixtures/unknown/wide-matrix/expected.json";
import wideMatrixRows from "../fixtures/unknown/wide-matrix/rows.json";

type FixtureColumnExpectation = {
	readonly role?: string;
	readonly roleSources?: readonly EvidenceSource[];
	readonly forbiddenRoleSources?: readonly EvidenceSource[];
	readonly unit?: string | null;
	readonly unitConfirmed?: boolean;
	readonly unitSources?: readonly EvidenceSource[];
	readonly forbiddenUnitSources?: readonly EvidenceSource[];
};

type FixtureExpected = {
	readonly layoutKind: LayoutKind;
	readonly blocks: number;
	readonly blockFamily: MeasurementFamily;
	readonly ivMode?: IvSweepMode;
	readonly minDataRegions?: number;
	readonly minNumericColumns?: number;
	readonly layoutBindings?: readonly Partial<LayoutBindingDraft>[];
	readonly columns?: Readonly<Record<string, FixtureColumnExpectation>>;
};

type TableFactsFixture = {
	readonly id: string;
	readonly fileName: string;
	readonly rows: readonly (readonly string[])[];
	readonly expected: FixtureExpected;
	readonly schemaProfiles?: readonly SchemaProfile[];
};

suite("workbench/services/tableFacts/test/browser/tableFactsFixtureCorpus", () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const fixtures: readonly TableFactsFixture[] = [
		{
			id: "iv-transfer",
			fileName: "transfer.csv",
			rows: ivTransferRows,
			expected: ivTransferExpected as FixtureExpected,
		},
		{
			id: "iv-output",
			fileName: "Output [sample].csv",
			rows: ivOutputRows,
			expected: ivOutputExpected as FixtureExpected,
		},
		{
			id: "cv",
			fileName: "#CV-60um-5,10kHz_2026-01-09-10-09-59.xls",
			rows: cvRows,
			expected: cvExpected as FixtureExpected,
		},
		{
			id: "cf",
			fileName: "#CF-10um-10_2026-01-09-11-09-36.xls",
			rows: cfRows,
			expected: cfExpected as FixtureExpected,
		},
		{
			id: "pv",
			fileName: "W-AOHZOAO-W-380C-PV-D100-WAKE UP_2026-01-15-16-25-29.xls",
			rows: pvRows,
			expected: pvExpected as FixtureExpected,
		},
		{
			id: "unknown/pairwise-xy",
			fileName: "xy.csv",
			rows: pairwiseXyRows,
			expected: pairwiseXyExpected as FixtureExpected,
		},
		{
			id: "unknown/wide-matrix",
			fileName: "matrix.csv",
			rows: wideMatrixRows,
			expected: wideMatrixExpected as FixtureExpected,
		},
		{
			id: "unknown/time-series",
			fileName: "timelog.csv",
			rows: timeSeriesRows,
			expected: timeSeriesExpected as FixtureExpected,
		},
		{
			id: "ch1-ch2/grouped-sweep",
			fileName: "sample.csv",
			rows: ch1Ch2GroupedSweepRows,
			expected: ch1Ch2GroupedSweepExpected as FixtureExpected,
		},
		{
			id: "malformed/no-numeric-data",
			fileName: "broken.csv",
			rows: malformedNoNumericDataRows,
			expected: malformedNoNumericDataExpected as FixtureExpected,
		},
		{
			id: "encoding/replacement-character",
			fileName: "encoded.csv",
			rows: encodingReplacementCharacterRows,
			expected: encodingReplacementCharacterExpected as FixtureExpected,
		},
		{
			id: "multi-block/repeated-dataname",
			fileName: "transfer.csv",
			rows: multiBlockRepeatedDataNameRows,
			expected: multiBlockRepeatedDataNameExpected as FixtureExpected,
		},
		{
			id: "schema-profile/exact-match",
			fileName: "transfer.csv",
			rows: schemaProfileExactMatchRows,
			expected: schemaProfileExactMatchExpected as FixtureExpected,
			schemaProfiles: schemaProfileExactMatchProfiles as readonly SchemaProfile[],
		},
		{
			id: "schema-profile/confirmed-family",
			fileName: "custom.csv",
			rows: schemaProfileConfirmedFamilyRows,
			expected: schemaProfileConfirmedFamilyExpected as FixtureExpected,
			schemaProfiles: schemaProfileConfirmedFamilyProfiles as readonly SchemaProfile[],
		},
		{
			id: "schema-profile/generic-voltage-current",
			fileName: "custom.csv",
			rows: schemaProfileGenericVoltageCurrentRows,
			expected: schemaProfileGenericVoltageCurrentExpected as FixtureExpected,
			schemaProfiles: schemaProfileGenericVoltageCurrentProfiles as readonly SchemaProfile[],
		},
		{
			id: "schema-profile/column-order-mismatch",
			fileName: "transfer.csv",
			rows: schemaProfileColumnOrderMismatchRows,
			expected: schemaProfileColumnOrderMismatchExpected as FixtureExpected,
			schemaProfiles: schemaProfileColumnOrderMismatchProfiles as readonly SchemaProfile[],
		},
	];

	for (const fixture of fixtures) {
		test(`assesses fixture ${fixture.id}`, async () => {
			const service = store.add(new RawTableFactsService());
			const result = await service.createRawTableFacts({
				fileId: `fixture:${fixture.id}`,
				rawTableId: "raw",
				sourceRawTableVersion: 1,
				fileName: fixture.fileName,
				rows: fixture.rows,
				schemaProfiles: fixture.schemaProfiles,
			});

			assertFixtureResult(result, fixture.expected);
		});
	}
});

const assertFixtureResult = (
	result: RawTableFactsRecord,
	expected: FixtureExpected,
): void => {
	assert.equal(result.layoutCandidates[0]?.layoutKind, expected.layoutKind);
	assert.equal(result.blocks.length, expected.blocks);
	assert.equal(result.blocks[0]?.family, expected.blockFamily);
	if (expected.ivMode !== undefined) {
		assert.equal(result.blocks[0]?.ivMode, expected.ivMode);
	}
	if (expected.minDataRegions !== undefined) {
		assert.ok(
			result.structure.dataRegions.length >= expected.minDataRegions,
			`expected at least ${expected.minDataRegions} data region(s)`,
		);
	}
	if (expected.minNumericColumns !== undefined) {
		const numericColumnCount = result.columnProfiles.filter(profile =>
			profile.kind === "numeric" || profile.kind === "mixed"
		).length;
		assert.ok(
			numericColumnCount >= expected.minNumericColumns,
			`expected at least ${expected.minNumericColumns} numeric column(s)`,
		);
	}
	if (expected.layoutBindings) {
		assertLayoutBindings(result, expected.layoutBindings);
	}
	if (expected.columns) {
		assertColumnExpectations(result, expected.columns);
	}
};

const assertLayoutBindings = (
	result: RawTableFactsRecord,
	expectedBindings: readonly Partial<LayoutBindingDraft>[],
): void => {
	const actualBindings = result.layoutCandidates[0]?.bindings ?? [];
	assert.equal(actualBindings.length, expectedBindings.length);
	for (let index = 0; index < expectedBindings.length; index += 1) {
		const expected = expectedBindings[index];
		const actual = actualBindings[index];
		assert.equal(actual?.groupByCol, expected.groupByCol);
		assert.equal(actual?.pointCol, expected.pointCol);
		assert.equal(actual?.xCol, expected.xCol);
		if (expected.yCols) {
			assert.deepEqual(actual?.yCols, expected.yCols);
		}
		if (expected.biasCols) {
			assert.deepEqual(actual?.biasCols, expected.biasCols);
		}
	}
};

const assertColumnExpectations = (
	result: RawTableFactsRecord,
	expectedColumns: Readonly<Record<string, FixtureColumnExpectation>>,
): void => {
	for (const [headerText, expected] of Object.entries(expectedColumns)) {
		const semanticCandidate = result.semanticCandidates.find(candidate => {
			const profile = result.columnProfiles.find(column => column.rawCol === candidate.rawCol);
			return profile?.headerText === headerText;
		});
		assert.ok(semanticCandidate, `missing semantic candidate for ${headerText}`);

		const roleCandidate = semanticCandidate.roleCandidates[0] ?? null;
		const unitCandidate = semanticCandidate.unitCandidates[0] ?? null;
		if (expected.role !== undefined) {
			assert.equal(roleCandidate?.role, expected.role);
		}
		if (expected.roleSources) {
			assert.deepEqual(roleCandidate?.sources ?? [], expected.roleSources);
		}
		for (const forbiddenSource of expected.forbiddenRoleSources ?? []) {
			assert.equal(
				roleCandidate?.sources.includes(forbiddenSource) ?? false,
				false,
				`${headerText} should not use ${forbiddenSource} role evidence`,
			);
		}
		if (expected.unit !== undefined) {
			assert.equal(unitCandidate?.canonicalUnit ?? null, expected.unit);
		}
		if (expected.unitConfirmed !== undefined) {
			assert.equal(unitCandidate?.confirmed ?? false, expected.unitConfirmed);
		}
		if (expected.unitSources) {
			assert.deepEqual(unitCandidate?.sources ?? [], expected.unitSources);
		}
		for (const forbiddenSource of expected.forbiddenUnitSources ?? []) {
			assert.equal(
				unitCandidate?.sources.includes(forbiddenSource) ?? false,
				false,
				`${headerText} should not use ${forbiddenSource} unit evidence`,
			);
		}

		const blockColumn = result.blocks
			.flatMap(block => block.columns.columns)
			.find(column => column.headerText === headerText);
		assert.ok(blockColumn, `missing block column for ${headerText}`);
		if (expected.role !== undefined) {
			assert.equal(blockColumn.role, expected.role);
		}
		if (expected.unit !== undefined) {
			assert.equal(blockColumn.unit ?? null, expected.unit);
		}
	}
};
