/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import type { ColumnProfile } from "src/cs/workbench/services/tableFacts/common/columnProfile";
import type { SchemaProfile } from "src/cs/workbench/services/schemaProfile/common/schemaProfile";
import {
	findExactSchemaProfileMatch,
	findSchemaProfileBindingForColumn,
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
	input: Pick<ColumnProfile, "rawCol" | "headerText" | "normalizedHeader">,
): ColumnProfile => ({
	...input,
	kind: "numeric",
});
