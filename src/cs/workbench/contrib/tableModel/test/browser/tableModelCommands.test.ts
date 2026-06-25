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
	CONFIRM_TABLE_MODEL_SCHEMA_PROFILE_COMMAND_ID,
	confirmTableModelSchemaProfileFromSession,
} from "src/cs/workbench/contrib/tableModel/browser/tableModelCommands";
import {
	TABLE_MODEL_RULE_VERSION,
	type TableModelRecord,
} from "src/cs/workbench/services/tableModel/common/tableModel";
import { createEmptyRawTableStructure } from "src/cs/workbench/services/tableModel/common/rawTableStructure";
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

suite("workbench/contrib/tableModel/test/browser/tableModelCommands", () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test("confirm schema profile command is registered", () => {
		assert.ok(CommandsRegistry.getCommand(CONFIRM_TABLE_MODEL_SCHEMA_PROFILE_COMMAND_ID));
	});

	test("confirms role and unit bindings from the stored TableModel", () => {
		const tableModel = createTableModel();
		const sessionService = createSessionService(createSnapshot(tableModel));
		const schemaProfileService = createSchemaProfileService();

		const profile = confirmTableModelSchemaProfileFromSession({
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
			columnProfiles: tableModel.columnProfiles,
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

	test("ignores missing TableModel and unsupported bindings", () => {
		const sessionService = createSessionService(createSnapshot(createTableModel()));
		const schemaProfileService = createSchemaProfileService();

		assert.equal(confirmTableModelSchemaProfileFromSession({
			fileId: "file-a",
			rawTableId: "missing",
			bindings: [{ rawCol: 0, role: "vg" }],
		}, sessionService, schemaProfileService), null);
		assert.equal(confirmTableModelSchemaProfileFromSession({
			fileId: "file-a",
			rawTableId: "table-a",
			bindings: [{ rawCol: 0, role: "unknown" }],
		}, sessionService, schemaProfileService), null);
		assert.deepEqual(schemaProfileService.confirmInputs, []);
	});

	test("command handler resolves session and schema profile services", () => {
		const tableModel = createTableModel();
		const sessionService = createSessionService(createSnapshot(tableModel));
		const schemaProfileService = createSchemaProfileService();
		const accessor = createAccessor([
			[ISessionService, sessionService],
			[ISchemaProfileService, schemaProfileService],
		]);

		const command = CommandsRegistry.getCommand(CONFIRM_TABLE_MODEL_SCHEMA_PROFILE_COMMAND_ID) as
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

const createTableModel = (): TableModelRecord => ({
	tableModelRuleVersion: TABLE_MODEL_RULE_VERSION,
	schemaProfileVersion: 0,
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
	tableModel: TableModelRecord,
): SessionSnapshot => ({
	schemaVersion: 1,
	sessionVersion: 1,
	fileOrder: ["file-a"],
	filesById: {
		"file-a": {
			tableModelByRawTableId: {
				[tableModel.rawTableId]: tableModel,
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
