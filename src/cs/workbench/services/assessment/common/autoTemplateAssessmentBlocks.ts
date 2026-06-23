/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type {
	MeasurementBlockRecord,
	MeasurementColumnRef,
	MeasurementFamily,
} from "src/cs/workbench/services/assessment/common/measurement";
import type {
	AxisRole,
	CurveKind,
	FileAssessmentConfidence,
	FileAssessmentSource,
} from "src/cs/workbench/services/assessment/common/fileAssessment";
import type {
	AutoExtractionBlock,
	AutoExtractionPlan,
	AutoExtractionResult,
} from "src/cs/workbench/services/assessment/common/autoTemplateTypes";

type AssessmentBlockPlanInput = {
	readonly assessment: unknown;
	readonly fileName?: unknown;
};

type AssessmentBlockPlanContext = {
	readonly autoApplyAllowed: boolean | null;
	readonly blocks: readonly MeasurementBlockRecord[];
	readonly reasons: readonly string[];
};

export const inferAutoExtractionFromAssessmentBlocks = ({
	assessment,
	fileName,
}: AssessmentBlockPlanInput): AutoExtractionResult | null => {
	const context = readAssessmentBlockPlanContext(assessment);
	if (!context || !context.blocks.length) {
		return null;
	}
	if (context.autoApplyAllowed !== true) {
		return null;
	}

	const blockPlans = context.blocks
		.map(block => createBlockPlan(block))
		.filter((plan): plan is BlockPlan => plan !== null);
	if (!blockPlans.length) {
		return {
			message: `${String(fileName ?? "file")}: assessment blocks do not include required x/y bindings.`,
			ok: false,
			reasons: [...context.reasons],
		};
	}

	const first = blockPlans[0];
	const yColumns = uniqueNumbers(blockPlans.flatMap(plan => plan.yCols));
	return {
		ok: true,
		plan: {
			bottomTitle: first.bottomTitle,
			blocks: blockPlans.map(plan => plan.block),
			confidence: first.confidence,
			curveType: first.curveType,
			curveTypeLabel: buildCurveTypeLabel(first.curveType, first.xAxisRole),
			dataStartRowIndex: first.dataStartRowIndex,
			groups: null,
			leftTitle: first.leftTitle,
			legendPrefix: "",
			legendStartColIndex: null,
			legendStartRowIndex: null,
			legendStartValue: null,
			legendCount: null,
			legendStep: null,
			legendTarget: "auto",
			needsTemplate: false,
			reasons: uniqueStrings([
				"Using assessment block column bindings.",
				...context.reasons,
			]),
			xAxisRole: first.xAxisRole,
			xAxisRoleSource: "metadata",
			xCol: first.xCol,
			xPointsPerGroup: null,
			xSegmentationMode: "auto",
			xUnit: first.xUnit,
			yCols: yColumns.length ? yColumns : [...first.yCols],
			yUnit: first.yUnit,
		},
	};
};

type BlockPlan = {
	readonly block: AutoExtractionBlock;
	readonly bottomTitle: string;
	readonly confidence: FileAssessmentConfidence;
	readonly curveType: CurveKind;
	readonly dataStartRowIndex: number;
	readonly leftTitle: string;
	readonly xAxisRole: AxisRole | null;
	readonly xCol: number;
	readonly xUnit: string;
	readonly yCols: readonly number[];
	readonly yUnit: string;
};

const createBlockPlan = (
	block: MeasurementBlockRecord,
): BlockPlan | null => {
	const curve = getCurveKind(block);
	if (!curve) {
		return null;
	}

	const xColumn = selectXColumn(block, curve);
	const yColumns = selectYColumns(block, curve);
	if (!xColumn || !yColumns.length) {
		return null;
	}

	const columnIndexes = [xColumn.rawCol, ...yColumns.map(column => column.rawCol)];
	const startCol = Math.min(...columnIndexes);
	const endCol = Math.max(...columnIndexes);
	const xAxisRole = getXAxisRole(block);
	const yCols = uniqueNumbers(yColumns.map(column => column.rawCol));
	return {
		block: {
			bottomTitle: getXTitle(xColumn, curve),
			endCol,
			legendStartColIndex: null,
			legendStartRowIndex: null,
			legendStep: null,
			legendTarget: "auto",
			startCol,
			xAxisRole,
			xCol: xColumn.rawCol,
			yCols,
		},
		bottomTitle: getXTitle(xColumn, curve),
		confidence: getConfidence(block.confidence),
		curveType: curve,
		dataStartRowIndex: Math.max(0, Math.floor(Number(
			block.source.dataRange?.startRow ?? block.source.fullRange.startRow ?? 0,
		))),
		leftTitle: getYTitle(yColumns[0] ?? null, curve),
		xAxisRole,
		xCol: xColumn.rawCol,
		xUnit: normalizeUnit(xColumn.unit) ?? getDefaultXUnit(curve),
		yCols,
		yUnit: normalizeUnit(yColumns[0]?.unit) ?? getDefaultYUnit(curve),
	};
};

const getCurveKind = (
	block: MeasurementBlockRecord,
): CurveKind | null => {
	if (block.family === "iv") {
		if (block.ivMode === "transfer") {
			return "transfer";
		}
		if (block.ivMode === "output") {
			return "output";
		}
		return null;
	}
	if (block.family === "cv" || block.family === "cf" || block.family === "pv") {
		return block.family;
	}
	return null;
};

const getXAxisRole = (
	block: MeasurementBlockRecord,
): AxisRole | null => {
	if (block.family !== "iv") {
		return null;
	}
	if (block.ivMode === "transfer") {
		return "vg";
	}
	if (block.ivMode === "output") {
		return "vd";
	}
	return null;
};

const selectXColumn = (
	block: MeasurementBlockRecord,
	curve: CurveKind,
): MeasurementColumnRef | null => {
	const columns = block.columns.columns;
	if (curve === "transfer") {
		return findColumnByRoles(columns, ["vg"]) ??
			findColumnByRoles(columns, ["voltage", "vd", "vs"]);
	}
	if (curve === "output") {
		return findColumnByRoles(columns, ["vd"]) ??
			findColumnByRoles(columns, ["voltage", "vg", "vs"]);
	}
	if (curve === "cf") {
		return columns.find(column => normalizeUnit(column.unit) === "Hz") ?? null;
	}
	return findColumnByRoles(columns, ["voltage", "vg", "vd", "vs"]);
};

const selectYColumns = (
	block: MeasurementBlockRecord,
	curve: CurveKind,
): readonly MeasurementColumnRef[] => {
	const columns = block.columns.columns;
	if (curve === "cv" || curve === "cf") {
		return columns.filter(column => column.role === "capacitance");
	}
	if (curve === "pv") {
		const idColumns = columns.filter(column => column.role === "id");
		return idColumns.length ? idColumns : columns.filter(column => column.role === "current");
	}
	const idColumns = columns.filter(column => column.role === "id");
	return idColumns.length
		? idColumns
		: columns.filter(column => column.role === "current");
};

const findColumnByRoles = (
	columns: readonly MeasurementColumnRef[],
	roles: readonly MeasurementColumnRef["role"][],
): MeasurementColumnRef | null =>
	columns.find(column => roles.includes(column.role)) ?? null;

const getXTitle = (
	column: MeasurementColumnRef,
	curve: CurveKind,
): string => {
	if (column.role === "vg") {
		return "Vg";
	}
	if (column.role === "vd") {
		return "Vd";
	}
	if (curve === "cf") {
		return "Frequency";
	}
	return column.headerText || "X";
};

const getYTitle = (
	column: MeasurementColumnRef | null,
	curve: CurveKind,
): string => {
	if (column?.role === "id") {
		return "Id";
	}
	if (curve === "cv" || curve === "cf") {
		return "Capacitance";
	}
	if (curve === "pv") {
		return "Current";
	}
	return column?.headerText || "Y";
};

const getDefaultXUnit = (
	curve: CurveKind,
): string => curve === "cf" ? "Hz" : "V";

const getDefaultYUnit = (
	curve: CurveKind,
): string => curve === "cv" || curve === "cf" ? "F" : "A";

const getConfidence = (
	value: unknown,
): FileAssessmentConfidence => {
	const confidence = Number(value);
	if (Number.isFinite(confidence) && confidence >= 0.8) {
		return "high";
	}
	if (Number.isFinite(confidence) && confidence >= 0.5) {
		return "medium";
	}
	return "low";
};

const buildCurveTypeLabel = (
	curveType: CurveKind,
	xAxisRole: AxisRole | null,
): string | null => {
	if (curveType === "transfer") {
		return xAxisRole === "vg" ? "transfer (vg)" : "transfer";
	}
	if (curveType === "output") {
		return xAxisRole === "vd" ? "output (vd)" : "output";
	}
	return curveType;
};

const normalizeUnit = (
	value: unknown,
): string | null => {
	const text = String(value ?? "").trim();
	return text || null;
};

const readAssessmentBlockPlanContext = (
	value: unknown,
): AssessmentBlockPlanContext | null => {
	if (!isObjectRecord(value)) {
		return null;
	}

	const rawBlocks = Array.isArray(value.assessmentBlocks)
		? value.assessmentBlocks
		: Array.isArray(value.blocks)
			? value.blocks
			: [];
	const blocks = rawBlocks
		.map(normalizeMeasurementBlock)
		.filter((block): block is MeasurementBlockRecord => block !== null);
	if (!blocks.length) {
		return null;
	}

	const assessmentDecisionReasons = readStringArray(value.assessmentDecisionReasons);
	const decisionReasons = readStringArray(readDecisionRecord(value)?.reasons);
	return {
		autoApplyAllowed: readAssessmentAutoApplyAllowed(value),
		blocks,
		reasons: assessmentDecisionReasons.length
			? assessmentDecisionReasons
			: decisionReasons.length
				? decisionReasons
				: readStringArray(value.curveTypeReasons),
	};
};

const readAssessmentAutoApplyAllowed = (
	value: Record<string, unknown>,
): boolean | null => {
	if (typeof value.assessmentAutoApplyAllowed === "boolean") {
		return value.assessmentAutoApplyAllowed;
	}
	if (typeof value.autoApplyAllowed === "boolean") {
		return value.autoApplyAllowed;
	}

	const decision = readDecisionRecord(value);
	return typeof decision?.autoApplyAllowed === "boolean"
		? decision.autoApplyAllowed
		: null;
};

const readDecisionRecord = (
	value: Record<string, unknown>,
): Record<string, unknown> | null =>
	isObjectRecord(value.decision) ? value.decision : null;

const normalizeMeasurementBlock = (
	value: unknown,
): MeasurementBlockRecord | null => {
	if (!isObjectRecord(value)) {
		return null;
	}
	if (!isMeasurementFamily(value.family)) {
		return null;
	}
	const columnsRecord = isObjectRecord(value.columns) ? value.columns : null;
	const columns = Array.isArray(columnsRecord?.columns)
		? columnsRecord.columns.map(normalizeMeasurementColumn).filter((column): column is MeasurementColumnRef => column !== null)
		: [];
	const fullRange = normalizeRange(isObjectRecord(value.source) ? value.source.fullRange : null) ?? {
		startRow: 0,
		endRow: 0,
		startCol: 0,
		endCol: 0,
	};
	const sourceRecord = isObjectRecord(value.source) ? value.source : null;
	return {
		id: readText(value.id) ?? "assessment:block",
		fileId: readText(value.fileId) ?? "",
		rawTableId: readText(value.rawTableId) ?? "",
		label: readText(value.label) ?? readText(value.family) ?? "assessment block",
		family: value.family,
		ivMode: value.ivMode === "transfer" || value.ivMode === "output" || value.ivMode === "unknown"
			? value.ivMode
			: undefined,
		source: {
			fullRange,
			headerRange: normalizeRange(sourceRecord?.headerRange),
			dataRange: normalizeRange(sourceRecord?.dataRange),
			titleRange: normalizeRange(sourceRecord?.titleRange),
		},
		columns: {
			columns,
		},
		rowCount: readNonNegativeInteger(value.rowCount) ?? 0,
		columnCount: readNonNegativeInteger(value.columnCount) ?? 0,
		confidence: readFiniteNumber(value.confidence),
		diagnosticCodes: readStringArray(value.diagnosticCodes),
	};
};

const normalizeMeasurementColumn = (
	value: unknown,
): MeasurementColumnRef | null => {
	if (!isObjectRecord(value)) {
		return null;
	}
	const rawCol = readNonNegativeInteger(value.rawCol);
	if (rawCol === null) {
		return null;
	}
	return {
		rawCol,
		headerText: readText(value.headerText) ?? "",
		role: isMeasurementColumnRole(value.role) ? value.role : "unknown",
		unit: readText(value.unit) ?? null,
		sourceRange: normalizeRange(value.sourceRange),
		confidence: readFiniteNumber(value.confidence),
	};
};

const normalizeRange = (
	value: unknown,
) => {
	if (!isObjectRecord(value)) {
		return undefined;
	}
	const startRow = readNonNegativeInteger(value.startRow);
	const endRow = readNonNegativeInteger(value.endRow);
	const startCol = readNonNegativeInteger(value.startCol);
	const endCol = readNonNegativeInteger(value.endCol);
	if (startRow === null || endRow === null || startCol === null || endCol === null) {
		return undefined;
	}
	return {
		startRow,
		endRow,
		startCol,
		endCol,
	};
};

const isMeasurementFamily = (
	value: unknown,
): value is MeasurementFamily =>
	value === "iv" ||
	value === "cv" ||
	value === "cf" ||
	value === "pv" ||
	value === "it" ||
	value === "unknown";

const isMeasurementColumnRole = (
	value: unknown,
): value is MeasurementColumnRef["role"] =>
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
	value === "unknown";

const readText = (
	value: unknown,
): string | null => {
	const text = String(value ?? "").trim();
	return text || null;
};

const readFiniteNumber = (
	value: unknown,
): number | undefined => {
	const number = Number(value);
	return Number.isFinite(number) ? number : undefined;
};

const readNonNegativeInteger = (
	value: unknown,
): number | null => {
	const number = Math.floor(Number(value));
	return Number.isFinite(number) && number >= 0 ? number : null;
};

const readStringArray = (
	value: unknown,
): string[] => {
	if (!Array.isArray(value)) {
		return [];
	}
	return value
		.map(item => String(item ?? "").trim())
		.filter(Boolean);
};

const uniqueNumbers = (
	values: readonly number[],
): number[] => {
	const result: number[] = [];
	const seen = new Set<number>();
	for (const value of values) {
		if (!Number.isInteger(value) || seen.has(value)) {
			continue;
		}
		seen.add(value);
		result.push(value);
	}
	return result;
};

const uniqueStrings = (
	values: readonly string[],
): string[] => {
	const result: string[] = [];
	const seen = new Set<string>();
	for (const value of values) {
		if (!value || seen.has(value)) {
			continue;
		}
		seen.add(value);
		result.push(value);
	}
	return result;
};

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
	Boolean(value) && typeof value === "object" && !Array.isArray(value);
