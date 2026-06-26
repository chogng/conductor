/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

export const TABLE_KNOWN_FILE_EXTENSIONS = [".csv", ".tsv", ".xls", ".xlsx"] as const;
export const TABLE_IMPORT_FILE_EXTENSIONS = [".csv", ".tsv", ".xlsx"] as const;

export type TableKnownFileExtension = typeof TABLE_KNOWN_FILE_EXTENSIONS[number];
export type TableImportFileExtension = typeof TABLE_IMPORT_FILE_EXTENSIONS[number];
export type TableFormatId = "csv" | "tsv" | "xls" | "xlsx";

export type TableFormatRegistration = {
	readonly id: TableFormatId;
	readonly extensions: readonly TableKnownFileExtension[];
	readonly canMaterialize: boolean;
};

const TABLE_FORMAT_REGISTRATIONS: readonly TableFormatRegistration[] = [
	{ id: "csv", extensions: [".csv"], canMaterialize: true },
	{ id: "tsv", extensions: [".tsv"], canMaterialize: true },
	{ id: "xls", extensions: [".xls"], canMaterialize: false },
	{ id: "xlsx", extensions: [".xlsx"], canMaterialize: true },
];

const TABLE_FORMAT_BY_EXTENSION = new Map<TableKnownFileExtension, TableFormatId>();
const TABLE_FORMAT_REGISTRATION_BY_ID = new Map<TableFormatId, TableFormatRegistration>();

for (const registration of TABLE_FORMAT_REGISTRATIONS) {
	TABLE_FORMAT_REGISTRATION_BY_ID.set(registration.id, registration);
	for (const extension of registration.extensions) {
		TABLE_FORMAT_BY_EXTENSION.set(extension, registration.id);
	}
}

export const getTableFormatByExtension = (
	extension: TableKnownFileExtension,
): TableFormatId => TABLE_FORMAT_BY_EXTENSION.get(extension)!;

export const getTableFormatRegistrations = (): readonly TableFormatRegistration[] =>
	TABLE_FORMAT_REGISTRATIONS;

export const canMaterializeTableFormat = (
	format: TableFormatId | null | undefined,
): boolean =>
	!!format && TABLE_FORMAT_REGISTRATION_BY_ID.get(format)?.canMaterialize === true;
