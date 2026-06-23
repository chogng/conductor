/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import {
	CommandsRegistry,
	type ICommand,
} from "src/cs/platform/commands/common/commands";
import type { ServicesAccessor, ServiceIdentifier } from "src/cs/platform/instantiation/common/instantiation";
import {
	CONFIRM_ASSESSMENT_SCHEMA_PROFILE_COMMAND_ID,
	confirmAssessmentSchemaProfileFromSession,
} from "src/cs/workbench/contrib/assessment/browser/assessmentCommands";
import {
	ASSESSMENT_RULE_VERSION,
	type RawTableAssessmentRecord,
} from "src/cs/workbench/services/assessment/common/assessment";
import { createEmptyRawTableStructure } from "src/cs/workbench/services/assessment/common/rawTableStructure";
import {
	ISchemaProfileService,
	type ISchemaProfileService as ISchemaProfileServiceType,
	type SchemaProfile,
} from "src/cs/workbench/services/schemaProfile/common/schemaProfile";
import type {
	ConfirmSchemaProfileInput,
} from "src/cs/workbench/services/schemaProfile/common/schemaProfileConfirmation";
import {
	ISessionService,
	type ISessionService as ISessionServiceType,
	type SessionSnapshot,
} from "src/cs/workbench/services/session/common/session";

suite("workbench/contrib/assessment/test/browser/assessmentCommands", () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test("confirm schema profile command is registered", () => {
		assert.ok(CommandsRegistry.getCommand(CONFIRM_ASSESSMENT_SCHEMA_PROFILE_COMMAND_ID));
	});

	test("confirms role and unit bindings from the stored raw table assessment", () => {
		const assessment = createRawTableAssessment();
		const sessionService = createSessionService(createSnapshot(assessment));
		const schemaProfileService = createSchemaProfileService();

		const profile = confirmAssessmentSchemaProfileFromSession({
			fileId: " file-a ",
			rawTableId: " table-a ",
			id: " profile-a ",
			scope: "workspace",
			bindings: [{
				rawCol: "0",
				role: "vg",
				axis: "x",
				canonicalUnit: "V",
			}, {
				rawCol: 1,
				role: "id",
				axis: "y",
				canonicalUnit: "A",
			}],
		}, sessionService, schemaProfileService);

		assert.equal(profile?.id, "profile-a");
		assert.equal(schemaProfileService.confirmInputs.length, 1);
		assert.deepEqual(schemaProfileService.confirmInputs[0], {
			id: "profile-a",
			scope: "workspace",
			schemaFingerprint: "dataname|gate|drain",
			columnProfiles: assessment.columnProfiles,
			bindings: [{
				rawCol: 0,
				role: "vg",
				axis: "x",
				canonicalUnit: "V",
			}, {
				rawCol: 1,
				role: "id",
				axis: "y",
				canonicalUnit: "A",
			}],
		});
	});

	test("ignores missing assessments and unsupported bindings", () => {
		const sessionService = createSessionService(createSnapshot(createRawTableAssessment()));
		const schemaProfileService = createSchemaProfileService();

		assert.equal(confirmAssessmentSchemaProfileFromSession({
			fileId: "file-a",
			rawTableId: "missing",
			bindings: [{ rawCol: 0, role: "vg" }],
		}, sessionService, schemaProfileService), null);
		assert.equal(confirmAssessmentSchemaProfileFromSession({
			fileId: "file-a",
			rawTableId: "table-a",
			bindings: [{ rawCol: 0, role: "unknown" }],
		}, sessionService, schemaProfileService), null);
		assert.deepEqual(schemaProfileService.confirmInputs, []);
	});

	test("command handler resolves session and schema profile services", () => {
		const assessment = createRawTableAssessment();
		const sessionService = createSessionService(createSnapshot(assessment));
		const schemaProfileService = createSchemaProfileService();
		const accessor = createAccessor([
			[ISessionService, sessionService],
			[ISchemaProfileService, schemaProfileService],
		]);

		const command = CommandsRegistry.getCommand(CONFIRM_ASSESSMENT_SCHEMA_PROFILE_COMMAND_ID) as
			| ICommand<[unknown], SchemaProfile | null>
			| undefined;
		const profile = command?.handler(accessor, {
			fileId: "file-a",
			rawTableId: "table-a",
			bindings: [{ rawCol: 1, role: "id", axis: "y", canonicalUnit: "A" }],
		});

		assert.equal(profile?.schemaFingerprint, "dataname|gate|drain");
		assert.equal(schemaProfileService.confirmInputs.length, 1);
	});
});

const createRawTableAssessment = (): RawTableAssessmentRecord => ({
	assessmentRuleVersion: ASSESSMENT_RULE_VERSION,
	recipeFingerprint: "recipe:test",
	templateCatalogVersion: 0,
	schemaProfileVersion: 0,
	templateCandidates: [],
	blocks: [],
	columnProfiles: [{
		rawCol: 0,
		headerText: "Gate",
		normalizedHeader: "gate",
		kind: "numeric",
	}, {
		rawCol: 1,
		headerText: "Drain",
		normalizedHeader: "drain",
		kind: "numeric",
	}],
	createdAt: 1,
	decision: {
		autoApplyAllowed: false,
		confidence: 0.5,
		reasons: [],
		state: "reviewRequired",
	},
	diagnostics: [],
	fileId: "file-a",
	groups: [],
	layoutCandidates: [],
	rawTableId: "table-a",
	semanticCandidates: [],
	sourceRawTableVersion: 1,
	structure: {
		...createEmptyRawTableStructure(),
		fingerprint: "dataname|gate|drain",
	},
});

const createSnapshot = (
	assessment: RawTableAssessmentRecord,
): SessionSnapshot => ({
	schemaVersion: 1,
	sessionVersion: 1,
	fileOrder: ["file-a"],
	filesById: {
		"file-a": {
			assessmentsByRawTableId: {
				[assessment.rawTableId]: assessment,
			},
		},
	},
} as unknown as SessionSnapshot);

const createSessionService = (
	snapshot: SessionSnapshot,
): Pick<ISessionServiceType, "getSnapshot"> => ({
	getSnapshot: () => snapshot,
});

const createSchemaProfileService = ():
	Pick<ISchemaProfileServiceType, "confirmProfile"> & {
		readonly confirmInputs: ConfirmSchemaProfileInput[];
	} => {
	const confirmInputs: ConfirmSchemaProfileInput[] = [];
	return {
		confirmInputs,
		confirmProfile: input => {
			confirmInputs.push(input);
			return {
				id: input.id?.trim() || "schema:dataname|gate|drain",
				scope: input.scope ?? "workspace",
				schemaFingerprint: input.schemaFingerprint,
				confirmedCount: 1,
				conflictCount: 0,
				bindings: [],
			} satisfies SchemaProfile;
		},
	};
};

function createAccessor(
	services: readonly (readonly [ServiceIdentifier<unknown>, unknown])[],
): ServicesAccessor {
	const values = new Map<ServiceIdentifier<unknown>, unknown>(services);
	return {
		get: <T>(id: ServiceIdentifier<T>): T =>
			values.get(id as ServiceIdentifier<unknown>) as T,
	};
}
