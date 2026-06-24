/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import {
	CommandsRegistry,
	type ICommandHandler,
} from "src/cs/platform/commands/common/commands";
import type { RawTableFactsRecord } from "src/cs/workbench/services/template/common/tableFacts";
import type { MeasurementColumnRole } from "src/cs/workbench/services/tableFacts/common/measurement";
import type { CanonicalUnit } from "src/cs/workbench/services/tableFacts/common/semanticCandidate";
import {
	ISchemaProfileService,
	type ISchemaProfileService as ISchemaProfileServiceType,
	type SchemaProfile,
	type SchemaProfileScope,
} from "src/cs/workbench/services/schemaProfile/common/schemaProfile";
import type {
	SchemaProfileConfirmationBinding,
} from "src/cs/workbench/services/schemaProfile/common/schemaProfileConfirmation";
import {
	ISessionService,
	type ISessionService as ISessionServiceType,
} from "src/cs/workbench/services/session/common/session";

export const CONFIRM_TABLE_FACTS_SCHEMA_PROFILE_COMMAND_ID =
	"tableFacts.confirmSchemaProfile";
export const CONFIRM_ASSESSMENT_SCHEMA_PROFILE_COMMAND_ID =
	"assessment.confirmSchemaProfile";

export type ConfirmTableFactsSchemaProfileCommandBinding = {
	readonly rawCol?: unknown;
	readonly role?: unknown;
	readonly axis?: unknown;
	readonly canonicalUnit?: unknown;
};

export type ConfirmTableFactsSchemaProfileCommandArgs = {
	readonly fileId?: unknown;
	readonly rawTableId?: unknown;
	readonly id?: unknown;
	readonly scope?: unknown;
	readonly bindings?: readonly ConfirmTableFactsSchemaProfileCommandBinding[];
};

export const confirmTableFactsSchemaProfileFromSession = (
	args: unknown,
	sessionService: Pick<ISessionServiceType, "getSnapshot">,
	schemaProfileService: Pick<ISchemaProfileServiceType, "confirmProfile">,
): SchemaProfile | null => {
	const commandArgs = normalizeConfirmArgs(args);
	if (!commandArgs) {
		return null;
	}

	const snapshot = sessionService.getSnapshot();
	const file = snapshot.filesById[commandArgs.fileId];
	if (!file) {
		return null;
	}

	const tableFacts = findTableFacts(file.tableFactsByRawTableId, commandArgs.rawTableId);
	if (!tableFacts?.structure.fingerprint || !tableFacts.columnProfiles.length) {
		return null;
	}

	const bindings = normalizeBindings(commandArgs.bindings);
	if (!bindings.length) {
		return null;
	}

	return schemaProfileService.confirmProfile({
		id: commandArgs.id,
		scope: commandArgs.scope,
		schemaFingerprint: tableFacts.structure.fingerprint,
		columnProfiles: tableFacts.columnProfiles,
		bindings,
	});
};

const confirmTableFactsSchemaProfileHandler: ICommandHandler<[unknown], SchemaProfile | null> = (
	accessor,
	args,
) =>
	confirmTableFactsSchemaProfileFromSession(
		args,
		accessor.get(ISessionService),
		accessor.get(ISchemaProfileService),
	);

const normalizeConfirmArgs = (
	args: unknown,
): {
	readonly fileId: string;
	readonly rawTableId: string | null;
	readonly id?: string | null;
	readonly scope?: SchemaProfileScope;
	readonly bindings: readonly ConfirmTableFactsSchemaProfileCommandBinding[];
} | null => {
	if (!args || typeof args !== "object") {
		return null;
	}

	const candidate = args as ConfirmTableFactsSchemaProfileCommandArgs;
	const fileId = normalizeText(candidate.fileId);
	if (!fileId || !Array.isArray(candidate.bindings)) {
		return null;
	}

	return {
		fileId,
		rawTableId: normalizeText(candidate.rawTableId) || null,
		id: normalizeText(candidate.id) || null,
		scope: candidate.scope === "workspace" ? "workspace" : undefined,
		bindings: candidate.bindings,
	};
};

const findTableFacts = (
	tableFactsByRawTableId: Readonly<Record<string, RawTableFactsRecord>>,
	rawTableId: string | null,
): RawTableFactsRecord | null => {
	if (rawTableId) {
		return tableFactsByRawTableId[rawTableId] ?? null;
	}

	const tableFacts = Object.values(tableFactsByRawTableId);
	return tableFacts.length === 1 ? tableFacts[0] : null;
};

const normalizeBindings = (
	bindings: readonly ConfirmTableFactsSchemaProfileCommandBinding[],
): readonly SchemaProfileConfirmationBinding[] => {
	const result: SchemaProfileConfirmationBinding[] = [];
	for (const binding of bindings) {
		const rawCol = normalizeColumnIndex(binding.rawCol);
		const role = normalizeRole(binding.role);
		if (rawCol === null || !role || role === "unknown") {
			continue;
		}

		result.push({
			rawCol,
			role,
			axis: normalizeAxis(binding.axis),
			canonicalUnit: normalizeCanonicalUnit(binding.canonicalUnit),
		});
	}

	return result;
};

const normalizeColumnIndex = (
	value: unknown,
): number | null => {
	const number = Math.floor(Number(value));
	return Number.isFinite(number) && number >= 0 ? number : null;
};

const normalizeRole = (
	value: unknown,
): MeasurementColumnRole | null =>
	value === "vd" ||
	value === "vg" ||
	value === "vs" ||
	value === "id" ||
	value === "ig" ||
	value === "is" ||
	value === "capacitance" ||
	value === "conductance" ||
	value === "time" ||
	value === "voltage" ||
	value === "current" ||
	value === "unknown"
		? value
		: null;

const normalizeAxis = (
	value: unknown,
): "x" | "y" | null =>
	value === "x" || value === "y" ? value : null;

const normalizeCanonicalUnit = (
	value: unknown,
): CanonicalUnit | null =>
	value === "V" ||
	value === "A" ||
	value === "ohm" ||
	value === "s" ||
	value === "F" ||
	value === "Hz" ||
	value === "S"
		? value
		: null;

const normalizeText = (
	value: unknown,
): string =>
	String(value ?? "").trim();

CommandsRegistry.registerCommand({
	id: CONFIRM_TABLE_FACTS_SCHEMA_PROFILE_COMMAND_ID,
	handler: confirmTableFactsSchemaProfileHandler,
});

CommandsRegistry.registerCommand({
	id: CONFIRM_ASSESSMENT_SCHEMA_PROFILE_COMMAND_ID,
	handler: confirmTableFactsSchemaProfileHandler,
});
