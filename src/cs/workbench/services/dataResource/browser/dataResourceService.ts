/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, type Event } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import type { URI } from "src/cs/base/common/uri";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import type { BrandedService } from "src/cs/platform/instantiation/common/instantiation";
import {
	IDataResourceService,
	type DataResourceLoadState,
	type DataResourceStructuredContentResolution,
	type DataResourceStructuredContentSnapshot,
	type DataResourceStructuredContentTarget,
	type IDataResourceStructuredContentReference,
} from "src/cs/workbench/services/dataResource/common/dataResource";
import {
	createEmptyStructuredContentStructure,
	type StructuredCanonicalUnit as CanonicalUnit,
	type StructuredColumnProfile as ColumnProfile,
	type StructuredColumnSemanticCandidate as ColumnSemanticCandidate,
	type StructuredContentDiagnostic,
	type StructuredContentEvidence,
	type StructuredContentSourceRange,
	type StructuredContentStructure,
	type StructuredLayoutCandidate as LayoutCandidate,
	type StructuredMeasurementBlockRecord as MeasurementBlockRecord,
	type StructuredMeasurementColumnRef as MeasurementColumnRef,
	type StructuredMeasurementColumnRole as MeasurementColumnRole,
	type StructuredMeasurementFamily as MeasurementFamily,
} from "src/cs/workbench/services/dataResource/common/structuredContent";
import {
	readTableModelContentRows,
	type TableModelContentSnapshot,
	type TableModelLoadState,
	type TableModelSheetSnapshot,
	type TableModelSnapshot,
	type TableParseDiagnostic,
} from "src/cs/workbench/services/table/common/model";
import type { TableSource } from "src/cs/workbench/services/table/common/table";
import {
	ITableModelService,
	type ITableModelService as ITableModelServiceType,
} from "src/cs/workbench/services/table/common/resolverService";

type StructuredContentSheetResolution =
	| {
		readonly kind: "found";
		readonly sheet: TableModelSheetSnapshot | null;
	}
	| {
		readonly kind: "missing";
	};

type StructuredColumnProjection = {
	readonly profile: ColumnProfile;
	readonly measurementColumn: MeasurementColumnRef;
	readonly semanticCandidate: ColumnSemanticCandidate;
};

type StructuredMeasurementProjection = {
	readonly family: MeasurementFamily;
	readonly ivMode?: MeasurementBlockRecord["ivMode"];
	readonly xCol: number;
	readonly yCols: readonly number[];
};

export class DataResourceService extends Disposable implements IDataResourceService {
	public declare readonly _serviceBrand: undefined;

	private readonly onDidChangeResourceEmitter = this._register(new Emitter<URI>());
	public readonly onDidChangeResource: Event<URI> = this.onDidChangeResourceEmitter.event;

	public constructor(
		@ITableModelService private readonly tableModelService: ITableModelServiceType,
	) {
		super();

		this._register(this.tableModelService.onDidChangeModel(model => {
			this.onDidChangeResourceEmitter.fire(model.resource);
		}));
	}

	public canHandleResource(resource: URI): boolean {
		return this.tableModelService.canHandleResource(resource);
	}

	public async resolveStructuredContent(
		target: DataResourceStructuredContentTarget,
	): Promise<IDataResourceStructuredContentReference> {
		const reference = await this.tableModelService.createModelReference(
			target.resource,
			createStructuredContentSource(target),
		);
		const resolution = createStructuredContentResolution(reference.object.getSnapshot(), target);
		return {
			object: resolution,
			dispose: () => {
				reference.dispose();
			},
		};
	}

	public getStructuredContent(
		target: DataResourceStructuredContentTarget,
	): DataResourceStructuredContentResolution | undefined {
		const model = this.tableModelService.get(target.resource);
		return model
			? createStructuredContentResolution(model.getSnapshot(), target)
			: undefined;
	}

	public resolve(target: DataResourceStructuredContentTarget): void {
		this.tableModelService.resolve(target.resource, createStructuredContentSource(target));
	}
}

const createStructuredContentResolution = (
	snapshot: TableModelSnapshot,
	target: DataResourceStructuredContentTarget,
): DataResourceStructuredContentResolution => {
	if (snapshot.loadState.state === "error") {
		return {
			kind: "loadError",
			loadState: {
				state: "error",
				message: snapshot.loadState.message,
			},
		};
	}
	if (snapshot.loadState.state !== "ready") {
		return {
			kind: "pending",
			loadState: toDataResourceLoadState(snapshot.loadState),
		};
	}

	const sheetResolution = resolveStructuredContentSheet(snapshot, target.sheetId ?? null);
	if (sheetResolution.kind === "missing") {
		return { kind: "missingSheet" };
	}

	const selectedSheet = sheetResolution.sheet;
	const content = selectedSheet
		? selectedSheet.content
		: snapshot.content;
	if (!content) {
		return { kind: "missingContent" };
	}

	const fileName = getStructuredContentFileName(target.resource, selectedSheet);
	return {
		kind: "ready",
		snapshot: {
			columnCount: content.columnCount,
			content,
			...(target.contentHash ? { contentHash: target.contentHash } : {}),
			fileName,
			resource: target.resource,
			rowCount: content.rowCount,
			...(target.sheetId ? { sheetId: target.sheetId } : {}),
			sourceModelVersion: snapshot.version,
			sourceUri: normalizeResourceIdentity(target.resource),
			sourceVersion: snapshot.sourceVersion,
			structuredContent: {
				...createStructuredContentEvidence(content),
				diagnostics: getStructuredContentDiagnostics(snapshot, selectedSheet).map(toStructuredContentDiagnostic),
			},
		},
	};
};

const toDataResourceLoadState = (
	loadState: TableModelLoadState,
): DataResourceLoadState => {
	if (loadState.state === "error") {
		return {
			state: "error",
			message: loadState.message,
		};
	}

	return {
		state: loadState.state,
		...(loadState.message ? { message: loadState.message } : {}),
	};
};

const createStructuredContentEvidence = (
	content: TableModelContentSnapshot,
): Omit<StructuredContentEvidence, "diagnostics"> => {
	const rows = readTableModelContentRows(content);
	const headerRowIndex = getStructuredContentHeaderRowIndex(rows);
	const dataStartRow = getStructuredContentDataStartRow(content, headerRowIndex);
	const dataRange = createStructuredContentDataRange(content, dataStartRow);
	const columns = createStructuredColumnProjections({
		content,
		dataStartRow,
		headerRowIndex,
		rows,
	});
	const measurement = createStructuredMeasurementProjection(columns.map(column => column.measurementColumn));
	const structure = createStructuredContentStructure({
		content,
		dataRange,
		headerRowIndex,
	});
	const layoutCandidates = measurement
		? [createStructuredLayoutCandidate(measurement, dataRange)]
		: [];
	const blocks = measurement
		? [createStructuredMeasurementBlock({
			columns: columns.map(column => column.measurementColumn),
			content,
			dataRange,
			headerRowIndex,
			measurement,
		})]
		: [];

	return {
		structure,
		columnProfiles: columns.map(column => column.profile),
		layoutCandidates,
		semanticCandidates: columns.map(column => column.semanticCandidate),
		groups: [],
		blocks,
	};
};

const createStructuredContentStructure = ({
	content,
	dataRange,
	headerRowIndex,
}: {
	readonly content: TableModelContentSnapshot;
	readonly dataRange: StructuredContentSourceRange | null;
	readonly headerRowIndex: number | null;
}): StructuredContentStructure => {
	if (!dataRange) {
		return createEmptyStructuredContentStructure();
	}

	const headerRange = headerRowIndex !== null
		? createStructuredContentRowRange(content, headerRowIndex)
		: null;
	const fingerprint = `uri-review:${content.columnCount}:${headerRowIndex ?? "none"}:${dataRange.startRow}:${dataRange.endRow}`;
	return {
		headerRows: headerRange
			? [{
				rowIndex: headerRowIndex ?? 0,
				range: headerRange,
				confidence: 0.8,
				source: "fallback",
			}]
			: [],
		unitRows: [],
		dataRegions: [{
			id: "uri-data-region",
			range: dataRange,
			rowCount: Math.max(0, dataRange.endRow - dataRange.startRow + 1),
			columnCount: content.columnCount,
		}],
		blockRegions: [{
			id: "uri-block-region",
			range: createStructuredContentFullRange(content),
			kind: "single",
		}],
		fingerprint,
	};
};

const createStructuredColumnProjections = ({
	content,
	dataStartRow,
	headerRowIndex,
	rows,
}: {
	readonly content: TableModelContentSnapshot;
	readonly dataStartRow: number;
	readonly headerRowIndex: number | null;
	readonly rows: readonly (readonly string[])[];
}): readonly StructuredColumnProjection[] => {
	const projections: StructuredColumnProjection[] = [];
	for (let column = 0; column < content.columnCount; column += 1) {
		const headerText = getStructuredContentHeaderText(rows, headerRowIndex, column);
		const normalizedHeader = normalizeHeaderText(headerText);
		const roleInference = inferMeasurementColumnRole(headerText);
		const kind = getStructuredColumnKind(rows, dataStartRow, column);
		const profile: ColumnProfile = {
			rawCol: column,
			headerText,
			normalizedHeader,
			explicitUnitText: roleInference.unit ?? null,
			kind,
		};
		const sourceRange = createStructuredContentColumnRange(content, headerRowIndex, column);
		const measurementColumn: MeasurementColumnRef = {
			rawCol: column,
			headerText,
			role: roleInference.role,
			unit: roleInference.unit ?? null,
			sourceRange,
			confidence: roleInference.confidence,
		};
		projections.push({
			profile,
			measurementColumn,
			semanticCandidate: {
				rawCol: column,
				roleCandidates: [{
					role: roleInference.role,
					confidence: roleInference.confidence,
					sources: ["header"],
				}],
				unitCandidates: roleInference.unit
					? [{
						canonicalUnit: roleInference.unit,
						confidence: roleInference.confidence,
						sources: ["header"],
						confirmed: false,
					}]
					: [],
			},
		});
	}
	return projections;
};

const createStructuredMeasurementProjection = (
	columns: readonly MeasurementColumnRef[],
): StructuredMeasurementProjection | null => {
	const xTransfer = findMeasurementColumn(columns, ["vg", "voltage"], "V");
	const xOutput = findMeasurementColumn(columns, ["vd", "voltage"], "V");
	const yCurrent = columns
		.filter(column => (column.role === "id" || column.role === "current") && normalizeText(column.unit) === "A")
		.map(column => column.rawCol);
	if (xTransfer !== null && yCurrent.length) {
		return {
			family: "iv",
			ivMode: "transfer",
			xCol: xTransfer,
			yCols: yCurrent,
		};
	}
	if (xOutput !== null && yCurrent.length) {
		return {
			family: "iv",
			ivMode: "output",
			xCol: xOutput,
			yCols: yCurrent,
		};
	}

	const xFrequency = findMeasurementColumn(columns, ["frequency"], "Hz");
	const yCapacitance = columns
		.filter(column => column.role === "capacitance" && normalizeText(column.unit) === "F")
		.map(column => column.rawCol);
	if (xFrequency !== null && yCapacitance.length) {
		return {
			family: "cf",
			xCol: xFrequency,
			yCols: yCapacitance,
		};
	}

	const xVoltage = findMeasurementColumn(columns, ["vg", "vd", "voltage"], "V");
	if (xVoltage !== null && yCapacitance.length) {
		return {
			family: "cv",
			xCol: xVoltage,
			yCols: yCapacitance,
		};
	}

	const xTime = findMeasurementColumn(columns, ["time"], "s");
	if (xTime !== null && yCurrent.length) {
		return {
			family: "it",
			xCol: xTime,
			yCols: yCurrent,
		};
	}

	return null;
};

const createStructuredLayoutCandidate = (
	measurement: StructuredMeasurementProjection,
	dataRange: StructuredContentSourceRange | null,
): LayoutCandidate => ({
	id: "uri-layout-simple-xy",
	layoutKind: "simpleXY",
	confidence: 0.9,
	bindings: [{
		...(dataRange ? { dataRange } : {}),
		xCol: measurement.xCol,
		yCols: measurement.yCols,
	}],
	reasons: ["uriReview.headerRoles"],
});

const createStructuredMeasurementBlock = ({
	columns,
	content,
	dataRange,
	headerRowIndex,
	measurement,
}: {
	readonly columns: readonly MeasurementColumnRef[];
	readonly content: TableModelContentSnapshot;
	readonly dataRange: StructuredContentSourceRange | null;
	readonly headerRowIndex: number | null;
	readonly measurement: StructuredMeasurementProjection;
}): MeasurementBlockRecord => {
	const fullRange = createStructuredContentFullRange(content);
	const headerRange = headerRowIndex !== null
		? createStructuredContentRowRange(content, headerRowIndex)
		: null;
	return {
		id: "uri-block-a",
		fileId: "uri-file",
		rawTableId: "uri-table",
		label: getStructuredMeasurementLabel(measurement),
		family: measurement.family,
		...(measurement.ivMode ? { ivMode: measurement.ivMode } : {}),
		source: {
			fullRange,
			...(headerRange ? { headerRange } : {}),
			...(dataRange ? { dataRange } : {}),
		},
		columns: {
			columns,
		},
		rowCount: content.rowCount,
		columnCount: content.columnCount,
		confidence: 0.95,
		diagnosticCodes: [],
	};
};

const getStructuredContentHeaderRowIndex = (
	rows: readonly (readonly string[])[],
): number | null => {
	const firstNonEmpty = rows.findIndex(row => row.some(cell => normalizeText(cell)));
	return firstNonEmpty >= 0 ? firstNonEmpty : null;
};

const getStructuredContentDataStartRow = (
	content: TableModelContentSnapshot,
	headerRowIndex: number | null,
): number => {
	if (content.rowCount <= 0) {
		return 0;
	}
	return Math.min(content.rowCount - 1, (headerRowIndex ?? -1) + 1);
};

const createStructuredContentDataRange = (
	content: TableModelContentSnapshot,
	dataStartRow: number,
): StructuredContentSourceRange | null => {
	if (content.rowCount <= 0 || content.columnCount <= 0) {
		return null;
	}
	return {
		startRow: dataStartRow,
		endRow: content.rowCount - 1,
		startCol: 0,
		endCol: content.columnCount - 1,
	};
};

const createStructuredContentFullRange = (
	content: TableModelContentSnapshot,
): StructuredContentSourceRange => ({
	startRow: 0,
	endRow: Math.max(0, content.rowCount - 1),
	startCol: 0,
	endCol: Math.max(0, content.columnCount - 1),
});

const createStructuredContentRowRange = (
	content: TableModelContentSnapshot,
	rowIndex: number,
): StructuredContentSourceRange => ({
	startRow: rowIndex,
	endRow: rowIndex,
	startCol: 0,
	endCol: Math.max(0, content.columnCount - 1),
});

const createStructuredContentColumnRange = (
	content: TableModelContentSnapshot,
	headerRowIndex: number | null,
	column: number,
): StructuredContentSourceRange => ({
	startRow: headerRowIndex ?? 0,
	endRow: Math.max(headerRowIndex ?? 0, content.rowCount - 1),
	startCol: column,
	endCol: column,
});

const getStructuredContentHeaderText = (
	rows: readonly (readonly string[])[],
	headerRowIndex: number | null,
	column: number,
): string => headerRowIndex !== null
	? normalizeText(rows[headerRowIndex]?.[column])
	: `Column ${column + 1}`;

const getStructuredColumnKind = (
	rows: readonly (readonly string[])[],
	dataStartRow: number,
	column: number,
): ColumnProfile["kind"] => {
	const values = rows
		.slice(dataStartRow)
		.map(row => normalizeText(row[column]))
		.filter(Boolean);
	if (!values.length) {
		return "empty";
	}
	const numericCount = values.filter(isFiniteNumberText).length;
	if (numericCount === values.length) {
		return "numeric";
	}
	return numericCount > 0 ? "mixed" : "text";
};

const inferMeasurementColumnRole = (
	headerText: string,
): { readonly role: MeasurementColumnRole; readonly unit?: CanonicalUnit; readonly confidence: number } => {
	const explicitUnit = inferCanonicalUnit(headerText);
	const normalized = normalizeHeaderText(headerText);
	if (matchesAnyHeader(normalized, ["vg", "vgs", "gatevoltage", "gatev", "voltagegate"])) {
		return { role: "vg", unit: explicitUnit ?? "V", confidence: 0.95 };
	}
	if (matchesAnyHeader(normalized, ["vd", "vds", "drainvoltage", "drainv", "voltagedrain"])) {
		return { role: "vd", unit: explicitUnit ?? "V", confidence: 0.95 };
	}
	if (matchesAnyHeader(normalized, ["vs", "sourcevoltage", "sourcev"])) {
		return { role: "vs", unit: explicitUnit ?? "V", confidence: 0.9 };
	}
	if (matchesAnyHeader(normalized, ["id", "ids", "draincurrent", "currentdrain"])) {
		return { role: "id", unit: explicitUnit ?? "A", confidence: 0.95 };
	}
	if (matchesAnyHeader(normalized, ["ig", "igs", "gatecurrent", "currentgate"])) {
		return { role: "ig", unit: explicitUnit ?? "A", confidence: 0.9 };
	}
	if (matchesAnyHeader(normalized, ["is", "sourcecurrent", "currentsource"])) {
		return { role: "is", unit: explicitUnit ?? "A", confidence: 0.9 };
	}
	if (normalized.includes("capacitance") || normalized === "c" || normalized.startsWith("cap")) {
		return { role: "capacitance", unit: explicitUnit ?? "F", confidence: 0.9 };
	}
	if (normalized.includes("conductance") || normalized === "g") {
		return { role: "conductance", unit: explicitUnit ?? "S", confidence: 0.85 };
	}
	if (normalized.includes("frequency") || normalized === "freq" || normalized === "f") {
		return { role: "frequency", unit: explicitUnit ?? "Hz", confidence: 0.9 };
	}
	if (normalized.includes("time") || normalized === "t") {
		return { role: "time", unit: explicitUnit ?? "s", confidence: 0.9 };
	}
	if (normalized.includes("voltage") || normalized === "v") {
		return { role: "voltage", unit: explicitUnit ?? "V", confidence: 0.75 };
	}
	if (normalized.includes("current") || normalized === "i") {
		return { role: "current", unit: explicitUnit ?? "A", confidence: 0.75 };
	}
	return { role: "unknown", unit: explicitUnit, confidence: 0.2 };
};

const inferCanonicalUnit = (
	headerText: string,
): CanonicalUnit | undefined => {
	const normalized = headerText
		.replace(/\u00b5|\u03bc/g, "u")
		.replace(/\u03a9|\u03c9|\u2126/g, "ohm")
		.toLowerCase();
	if (/\b(hz|khz|mhz)\b/.test(normalized)) {
		return "Hz";
	}
	if (/\b(ms|sec|second|seconds|s)\b/.test(normalized)) {
		return "s";
	}
	if (/\b(pf|nf|uf|mf|f)\b/.test(normalized)) {
		return "F";
	}
	if (/\b(na|ua|ma|a)\b/.test(normalized)) {
		return "A";
	}
	if (/\b(mv|v|kv)\b/.test(normalized)) {
		return "V";
	}
	if (normalized.includes("ohm")) {
		return "ohm";
	}
	if (/\b(msiemens|siemens|ms|s)\b/.test(normalized) && normalized.includes("conductance")) {
		return "S";
	}
	return undefined;
};

const normalizeHeaderText = (
	value: unknown,
): string => normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, "");

const matchesAnyHeader = (
	normalizedHeader: string,
	candidates: readonly string[],
): boolean => candidates.some(candidate => normalizedHeader === candidate || normalizedHeader.includes(candidate));

const findMeasurementColumn = (
	columns: readonly MeasurementColumnRef[],
	roles: readonly MeasurementColumnRole[],
	unit: CanonicalUnit,
): number | null => {
	const column = columns.find(candidate =>
		roles.includes(candidate.role) &&
		normalizeText(candidate.unit) === unit
	);
	return column?.rawCol ?? null;
};

const isFiniteNumberText = (
	value: string,
): boolean => {
	const normalized = value.replace(/,/g, "");
	return normalized !== "" && Number.isFinite(Number(normalized));
};

const getStructuredMeasurementLabel = (
	measurement: StructuredMeasurementProjection,
): string => {
	if (measurement.family === "iv" && measurement.ivMode === "transfer") {
		return "Detected IV Transfer";
	}
	if (measurement.family === "iv" && measurement.ivMode === "output") {
		return "Detected IV Output";
	}
	return `Detected ${measurement.family.toUpperCase()}`;
};

const toStructuredContentDiagnostic = (
	diagnostic: TableParseDiagnostic,
): StructuredContentDiagnostic => ({
	severity: diagnostic.severity,
	code: diagnostic.code,
	message: diagnostic.message,
	...(diagnostic.rowIndex !== undefined || diagnostic.columnIndex !== undefined ? {
		sourceRange: {
			startRow: diagnostic.rowIndex ?? 0,
			endRow: diagnostic.rowIndex ?? 0,
			startCol: diagnostic.columnIndex ?? 0,
			endCol: diagnostic.columnIndex ?? 0,
		},
	} : {}),
});

const resolveStructuredContentSheet = (
	snapshot: TableModelSnapshot,
	requestedSheetId: string | null,
): StructuredContentSheetResolution => {
	if (requestedSheetId) {
		const sheet = snapshot.sheets.find(candidate => candidate.sheetId === requestedSheetId);
		return sheet
			? { kind: "found", sheet }
			: { kind: "missing" };
	}

	return {
		kind: "found",
		sheet: snapshot.sheets.find(sheet => sheet.sheetId === snapshot.defaultSheetId) ??
			snapshot.sheets[0] ??
			null,
	};
};

const getStructuredContentDiagnostics = (
	snapshot: TableModelSnapshot,
	sheet: TableModelSheetSnapshot | null,
): readonly TableParseDiagnostic[] => [
	...snapshot.diagnostics,
	...(sheet?.diagnostics ?? []),
];

const getStructuredContentFileName = (
	resource: URI,
	sheet: TableModelSheetSnapshot | null,
): string => {
	const sheetName = normalizeText(sheet?.sheetName);
	if (sheetName) {
		return sheetName;
	}

	const path = normalizeText(resource.path);
	const name = path.split(/[\\/]/).filter(Boolean).pop();
	return name || getResourceIdentityString(resource);
};

const createStructuredContentSource = (
	target: DataResourceStructuredContentTarget,
): TableSource => ({
	resource: target.resource,
	...(target.sheetId ? { sheetId: target.sheetId } : {}),
});

const normalizeResourceIdentity = (
	resource: URI | undefined,
): string => {
	const text = getResourceIdentityString(resource);
	if (text) {
		return normalizeResourceText(text);
	}

	if (resource && typeof resource === "object") {
		const candidate = resource as { readonly scheme?: unknown; readonly authority?: unknown; readonly path?: unknown; readonly query?: unknown; readonly fragment?: unknown };
		const scheme = normalizeText(candidate.scheme);
		const path = normalizeText(candidate.path);
		if (scheme && path) {
			const authority = normalizeText(candidate.authority);
			const query = normalizeText(candidate.query);
			const fragment = normalizeText(candidate.fragment);
			return normalizeResourceText(
				scheme === "file"
					? `file://${authority}${path}${query ? `?${query}` : ""}${fragment ? `#${fragment}` : ""}`
					: `${scheme}://${authority}${path}${query ? `?${query}` : ""}${fragment ? `#${fragment}` : ""}`,
			);
		}
	}

	return "";
};

const getResourceIdentityString = (
	resource: unknown,
): string => {
	if (!resource) {
		return "";
	}

	if (typeof resource === "string") {
		return normalizeText(resource);
	}

	const toString = (resource as { readonly toString?: unknown }).toString;
	if (typeof toString === "function" && toString !== Object.prototype.toString) {
		const text = normalizeText(toString.call(resource));
		return text === "[object Object]" ? "" : text;
	}

	return "";
};

const normalizeResourceText = (
	value: unknown,
): string => normalizeText(value).replace(/\\/g, "/");

const normalizeText = (
	value: unknown,
): string => String(value ?? "").trim();

registerSingleton(
	IDataResourceService,
	DataResourceService as unknown as new (...services: BrandedService[]) => IDataResourceService,
	InstantiationType.Delayed,
);
