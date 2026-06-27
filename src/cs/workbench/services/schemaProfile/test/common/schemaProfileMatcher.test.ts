/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import type {
	StructuredColumnProfile,
	StructuredMeasurementColumnRef,
} from "src/cs/workbench/services/dataResource/common/structuredContent";
import type { SchemaProfile } from "src/cs/workbench/services/schemaProfile/common/schemaProfile";
import {
	findExactSchemaProfileMatch,
	findSchemaProfileBindingForColumn,
	findSimilarSchemaProfileMatch,
} from "src/cs/workbench/services/schemaProfile/common/schemaProfileMatcher";

suite("workbench/services/schemaProfile/test/common/schemaProfileMatcher", () => {
	test("matches only confirmed conflict-free exact fingerprints", () => {
		const profiles: SchemaProfile[] = [
			createProfile({
				id: "fuzzy",
				schemaFingerprint: "vg|id|extra",
				confirmedCount: 12,
			}),
			createProfile({
				id: "conflicted",
				schemaFingerprint: "vg|id",
				confirmedCount: 12,
				conflictCount: 1,
			}),
			createProfile({
				id: "unconfirmed",
				schemaFingerprint: "vg|id",
				confirmedCount: 0,
			}),
			createProfile({
				id: "empty",
				schemaFingerprint: "vg|id",
				confirmedCount: 12,
				bindings: [],
			}),
			createProfile({
				id: "match",
				schemaFingerprint: "vg|id",
				confirmedCount: 2,
			}),
		];

		const result = findExactSchemaProfileMatch({
			fingerprint: "vg|id",
			profiles,
		});

		assert.equal(result?.profile.id, "match");
		assert.equal(result?.kind, "exact");
		assert.equal(result?.reason, "exactFingerprint");
		assert.equal(result?.confidence, 0.96);
	});

	test("matches column bindings by index and normalized header", () => {
		const profile = createProfile({
			id: "profile",
			schemaFingerprint: "gatevoltage|draincurrent",
			confirmedCount: 1,
			bindings: [{
				selector: {
					columnIndex: 1,
					normalizedHeader: "drain current",
				},
				role: "id",
				canonicalUnit: "A",
			}],
		});
		const column = createColumnProfile({
			rawCol: 1,
			headerText: "Drain   Current",
			normalizedHeader: "drain current",
		});

		const binding = findSchemaProfileBindingForColumn(profile, column);

		assert.equal(binding?.role, "id");
		assert.equal(binding?.canonicalUnit, "A");
		assert.equal(findSchemaProfileBindingForColumn(profile, {
			...column,
			rawCol: 2,
		}), null);
		assert.equal(findSchemaProfileBindingForColumn(profile, {
			...column,
			normalizedHeader: "gate current",
		}), null);
	});

	test("matches similar schema profiles with header and role overlap", () => {
		const profile = createProfile({
			id: "similar",
			schemaFingerprint: "old-fingerprint",
			confirmedCount: 3,
			bindings: [{
				selector: {
					columnIndex: 0,
					normalizedHeader: "gate voltage",
				},
				role: "vg",
				axis: "x",
				canonicalUnit: "V",
			}, {
				selector: {
					columnIndex: 1,
					normalizedHeader: "drain current",
				},
				role: "id",
				axis: "y",
				canonicalUnit: "A",
			}],
		});

		const result = findSimilarSchemaProfileMatch({
			profiles: [profile],
			columnProfiles: [
				createColumnProfile({
					rawCol: 0,
					headerText: "Gate Voltage",
					normalizedHeader: "gate voltage",
				}),
				createColumnProfile({
					rawCol: 1,
					headerText: "Drain Current",
					normalizedHeader: "drain current",
				}),
			],
			measurementColumns: [
				createMeasurementColumn({
					rawCol: 0,
					headerText: "Gate Voltage",
					role: "vg",
					unit: "V",
				}),
				createMeasurementColumn({
					rawCol: 1,
					headerText: "Drain Current",
					role: "id",
					unit: "A",
				}),
			],
			minConfidence: 0.75,
		});

		assert.equal(result?.kind, "similar");
		assert.equal(result?.reason, "schemaProfile.similarSchema");
		assert.equal(result?.profile.id, "similar");
		assert.equal(result?.bindingCoverage, 1);
		assert.equal(result?.scores.headerOverlap, 1);
		assert.ok((result?.confidence ?? 0) >= 0.75);
	});

	test("does not match similar schema profiles below threshold", () => {
		const profile = createProfile({
			id: "weak",
			schemaFingerprint: "old-fingerprint",
			confirmedCount: 3,
			bindings: [{
				selector: {
					columnIndex: 10,
					normalizedHeader: "gate voltage",
				},
				role: "vg",
				axis: "x",
				canonicalUnit: "V",
			}],
		});

		const result = findSimilarSchemaProfileMatch({
			profiles: [profile],
			columnProfiles: [createColumnProfile({
				rawCol: 0,
				headerText: "Time",
				normalizedHeader: "time",
			})],
			minConfidence: 0.1,
		});

		assert.equal(result, null);
	});

	test("does not match ineligible similar schema profiles", () => {
		const result = findSimilarSchemaProfileMatch({
			profiles: [
				createProfile({
					id: "conflicted",
					schemaFingerprint: "old-conflicted",
					confirmedCount: 3,
					conflictCount: 1,
				}),
				createProfile({
					id: "unconfirmed",
					schemaFingerprint: "old-unconfirmed",
					confirmedCount: 0,
				}),
				createProfile({
					id: "empty",
					schemaFingerprint: "old-empty",
					confirmedCount: 3,
					bindings: [],
				}),
			],
			columnProfiles: [createColumnProfile({
				rawCol: 0,
				headerText: "Vg",
				normalizedHeader: "vg",
			})],
			measurementColumns: [createMeasurementColumn({
				rawCol: 0,
				headerText: "Vg",
				role: "vg",
				unit: "V",
			})],
			minConfidence: 0.1,
		});

		assert.equal(result, null);
	});
});

const createProfile = ({
	bindings = [{
		selector: {
			columnIndex: 0,
		},
		role: "vg",
		canonicalUnit: "V",
	}],
	conflictCount = 0,
	confirmedCount,
	id,
	schemaFingerprint,
}: {
	readonly bindings?: SchemaProfile["bindings"];
	readonly conflictCount?: number;
	readonly confirmedCount: number;
	readonly id: string;
	readonly schemaFingerprint: string;
}): SchemaProfile => ({
	id,
	scope: "workspace",
	schemaFingerprint,
	confirmedCount,
	conflictCount,
	bindings,
});

const createColumnProfile = (
	input: Pick<StructuredColumnProfile, "rawCol" | "headerText" | "normalizedHeader">,
): StructuredColumnProfile => ({
	...input,
	kind: "numeric",
});

const createMeasurementColumn = (
	input: Pick<StructuredMeasurementColumnRef, "rawCol" | "headerText" | "role" | "unit">,
): StructuredMeasurementColumnRef => ({
	...input,
	confidence: 0.95,
});
