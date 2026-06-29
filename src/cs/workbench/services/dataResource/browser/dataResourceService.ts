/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, type Event } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import type { URI } from "src/cs/base/common/uri";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import type { BrandedService } from "src/cs/platform/instantiation/common/instantiation";
import { startPerf } from "src/cs/workbench/common/perf";
import {
	IDataResourceService,
	type DataResourceLoadState,
	type DataResourceStructuredContentResolution,
	type DataResourceStructuredContentSnapshot,
	type DataResourceStructuredContentTarget,
	type IDataResourceStructuredContentReference,
} from "src/cs/workbench/services/dataResource/common/dataResource";
import {
	dataResourceSemanticLibraryFingerprint,
	matchDataResourceRowMarker,
	matchDataResourceSemanticTitle,
	normalizeDataResourceSemanticText,
} from "src/cs/workbench/services/dataResource/common/semanticLibrary";
import {
	createEmptyStructuredContentStructure,
	readStructuredContentRows,
	type StructuredBindingCandidate,
	type StructuredColumnProfile,
	type StructuredColumnSemanticCandidate,
	type StructuredColumnTitleSpanEvidence,
	type StructuredContentDiagnostic,
	type StructuredContentEvidence,
	type StructuredContentSourceRange,
	type StructuredContentStructure,
	type StructuredDataBlockCandidate,
	type StructuredDependentValueCandidate,
	type StructuredMeasurementBlockRecord,
	type StructuredMeasurementColumnRef,
	type StructuredMeasurementFamily,
	type StructuredXGroupCandidate,
	type StructuredXRangeCandidate,
	type StructuredXRangeDirection,
	type StructuredXRangeStepKind,
} from "src/cs/workbench/services/dataResource/common/structuredContent";
import {
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

type NumericRun = {
	readonly id: string;
	readonly column: number;
	readonly startRow: number;
	readonly endRow: number;
	readonly values: readonly number[];
	readonly coverage: number;
	readonly pointCount: number;
};

type XRangeAnalysis = {
	readonly candidate: StructuredXRangeCandidate;
	readonly run: NumericRun;
};

type NumericPatternAnalysis = {
	readonly direction: StructuredXRangeDirection;
	readonly monotonicity: number;
	readonly stepKind: StructuredXRangeStepKind;
	readonly step?: number;
	readonly isConstantValue: boolean;
	readonly hasStableStep: boolean;
};

type GroupRange = {
	readonly startOffset: number;
	readonly endOffset: number;
	readonly direction: Exclude<StructuredXRangeDirection, "mixed">;
	readonly groupKind: StructuredXGroupCandidate["groupKind"];
};

const MinimumNumericRunPoints = 2;
const BlockXConfidenceThreshold = 0.55;
const NumberTolerance = 1e-9;

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
	const evidence = createStructuredContentEvidence(content);
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
				...evidence,
				diagnostics: [
					...evidence.diagnostics,
					...getStructuredContentDiagnostics(snapshot, selectedSheet).map(toStructuredContentDiagnostic),
				],
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
): StructuredContentEvidence => {
	const endPerf = startPerf("dataResource.structuredContent.evidence", {
		columnCount: content.columnCount,
		rowCount: content.rowCount,
	}, { silent: true });
	let blockCount = 0;
	let columnProfileCount = 0;
	let bindingCandidateCount = 0;
	try {
		const rows = getStructuredContentRows(content);
		const numericRuns = createNumericRuns({
			columnCount: content.columnCount,
			rows,
		});
		const columnTitleSpans = createColumnTitleSpanEvidence({
			numericRuns,
			rows,
		});
		const columnProfiles = createColumnProfiles({
			columnCount: content.columnCount,
			numericRuns,
			rows,
			titleSpans: columnTitleSpans,
		});
		const semanticCandidates = createColumnSemanticCandidates({
			columnProfiles,
			titleSpans: columnTitleSpans,
		});
		const xRangeAnalyses = createXRangeAnalyses({
			columnCount: content.columnCount,
			numericRuns,
			rows,
			titleSpans: columnTitleSpans,
		});
		const xRangeCandidates = xRangeAnalyses.map(analysis => analysis.candidate);
		const xGroupCandidates = createXGroupCandidates(xRangeAnalyses);
		const dataBlockCandidates = createDataBlockCandidates({
			columnCount: content.columnCount,
			rows,
			titleSpans: columnTitleSpans,
			xGroupCandidates,
			xRangeAnalyses,
		});
		const dependentValueCandidates = createDependentValueCandidates({
			dataBlockCandidates,
			rows,
		});
		const bindingCandidates = createBindingCandidates({
			dataBlockCandidates,
			dependentValueCandidates,
		});
		const structure = createStructuredContentStructure({
			columnCount: content.columnCount,
			dataBlockCandidates,
			numericRuns,
			rowCount: content.rowCount,
			titleSpans: columnTitleSpans,
		});
		const blocks = createStructuredMeasurementBlocks({
			columnProfiles,
			content,
			dataBlockCandidates,
			titleSpans: columnTitleSpans,
		});
		const diagnostics = createEvidenceDiagnostics({
			bindingCandidates,
			columnCount: content.columnCount,
			numericRuns,
			rowCount: content.rowCount,
		});

		blockCount = blocks.length;
		columnProfileCount = columnProfiles.length;
		bindingCandidateCount = bindingCandidates.length;
		return {
			structure,
			columnProfiles,
			xRangeCandidates,
			xGroupCandidates,
			dataBlockCandidates,
			dependentValueCandidates,
			columnTitleSpans,
			bindingCandidates,
			semanticLibraryFingerprint: dataResourceSemanticLibraryFingerprint,
			semanticCandidates,
			groups: [],
			blocks,
			diagnostics,
		};
	} finally {
		endPerf({
			bindingCandidateCount,
			blockCount,
			columnProfileCount,
		});
	}
};

const getStructuredContentRows = (
	content: TableModelContentSnapshot,
): readonly (readonly string[])[] =>
	content.rowWindows?.length
		? readStructuredContentRows(content)
		: content.rows;

const createNumericRuns = ({
	columnCount,
	rows,
}: {
	readonly columnCount: number;
	readonly rows: readonly (readonly string[])[];
}): readonly NumericRun[] => {
	const runs: NumericRun[] = [];
	for (let column = 0; column < columnCount; column += 1) {
		let startRow: number | null = null;
		let values: number[] = [];
		for (let rowIndex = 0; rowIndex <= rows.length; rowIndex += 1) {
			const value = rowIndex < rows.length
				? parseFiniteNumber(rows[rowIndex]?.[column])
				: null;
			if (value !== null) {
				startRow ??= rowIndex;
				values.push(value);
				continue;
			}

			if (startRow !== null && values.length >= MinimumNumericRunPoints) {
				const endRow = rowIndex - 1;
				runs.push({
					id: `numeric-run:c${column}:r${startRow}-${endRow}`,
					column,
					startRow,
					endRow,
					values,
					coverage: values.length / Math.max(1, endRow - startRow + 1),
					pointCount: values.length,
				});
			}
			startRow = null;
			values = [];
		}
	}
	return runs;
};

const createColumnTitleSpanEvidence = ({
	numericRuns,
	rows,
}: {
	readonly numericRuns: readonly NumericRun[];
	readonly rows: readonly (readonly string[])[];
}): readonly StructuredColumnTitleSpanEvidence[] => {
	const spans: StructuredColumnTitleSpanEvidence[] = [];
	for (const run of numericRuns) {
		const titleCell = findTitleCellForNumericRun(rows, run);
		if (!titleCell) {
			continue;
		}

		const match = matchDataResourceSemanticTitle(titleCell.text);
		if (!match) {
			continue;
		}

		spans.push({
			id: `title-span:c${run.column}:r${run.startRow}-${run.endRow}`,
			titleCell,
			targetColumn: run.column,
			startRow: run.startRow,
			endRow: run.endRow,
			normalizedTitle: match.normalizedTitle,
			canonicalRole: match.canonicalRole,
			...(match.canonicalUnit ? { canonicalUnit: match.canonicalUnit } : {}),
			axisTendency: match.axisTendency,
			confidence: match.confidence,
			reasons: match.reasons,
		});
	}
	return spans;
};

const findTitleCellForNumericRun = (
	rows: readonly (readonly string[])[],
	run: NumericRun,
): StructuredColumnTitleSpanEvidence["titleCell"] | null => {
	const immediateRow = run.startRow - 1;
	if (immediateRow >= 0) {
		const immediate = readTitleCellFromRow(rows[immediateRow] ?? [], immediateRow, run.column);
		if (immediate) {
			return immediate;
		}
	}

	const minimumRow = Math.max(0, run.startRow - 64);
	for (let rowIndex = immediateRow - 1; rowIndex >= minimumRow; rowIndex -= 1) {
		const row = rows[rowIndex] ?? [];
		if (getRowNumericCount(row) >= 2) {
			break;
		}
		const titleCell = readTitleCellFromRow(row, rowIndex, run.column);
		if (titleCell) {
			return titleCell;
		}
	}
	return null;
};

const readTitleCellFromRow = (
	row: readonly string[],
	rowIndex: number,
	targetColumn: number,
): StructuredColumnTitleSpanEvidence["titleCell"] | null => {
	const firstCellMarker = matchDataResourceRowMarker(row[0]);
	const targetText = normalizeText(row[targetColumn]);
	if (firstCellMarker === "titleRow") {
		return targetText
			? {
				row: rowIndex,
				column: targetColumn,
				text: targetText,
			}
			: null;
	}
	if (firstCellMarker === "dataRow") {
		return null;
	}
	if (targetText && parseFiniteNumber(targetText) === null) {
		return {
			row: rowIndex,
			column: targetColumn,
			text: targetText,
		};
	}
	return null;
};

const createColumnProfiles = ({
	columnCount,
	numericRuns,
	rows,
	titleSpans,
}: {
	readonly columnCount: number;
	readonly numericRuns: readonly NumericRun[];
	readonly rows: readonly (readonly string[])[];
	readonly titleSpans: readonly StructuredColumnTitleSpanEvidence[];
}): readonly StructuredColumnProfile[] => {
	const longestRunsByColumn = createLongestRunsByColumn(numericRuns);
	const titleSpansByColumn = createBestTitleSpanByColumn(titleSpans);
	return Array.from({ length: columnCount }, (_, column): StructuredColumnProfile => {
		const titleSpan = titleSpansByColumn.get(column);
		const headerText = titleSpan?.titleCell.text ?? getFallbackColumnHeaderText(column);
		const normalizedHeader = titleSpan?.normalizedTitle ?? normalizeDataResourceSemanticText(headerText);
		const numericRun = longestRunsByColumn.get(column);
		const explicitUnitText = titleSpan?.canonicalUnit ?? null;
		return {
			rawCol: column,
			headerText,
			normalizedHeader,
			explicitUnitText,
			kind: getColumnKind(rows, column),
			...(numericRun ? { numericStats: createColumnNumericStats(numericRun) } : {}),
		};
	});
};

const createColumnSemanticCandidates = ({
	columnProfiles,
	titleSpans,
}: {
	readonly columnProfiles: readonly StructuredColumnProfile[];
	readonly titleSpans: readonly StructuredColumnTitleSpanEvidence[];
}): readonly StructuredColumnSemanticCandidate[] => {
	const titleSpansByColumn = createBestTitleSpanByColumn(titleSpans);
	return columnProfiles.map(profile => {
		const titleSpan = titleSpansByColumn.get(profile.rawCol);
		const match = titleSpan
			? null
			: matchDataResourceSemanticTitle(profile.headerText);
		const role = titleSpan?.canonicalRole ?? match?.canonicalRole ?? "unknown";
		const unit = titleSpan?.canonicalUnit ?? match?.canonicalUnit;
		const confidence = titleSpan?.confidence ?? match?.confidence ?? 0.2;
		return {
			rawCol: profile.rawCol,
			roleCandidates: [{
				role,
				confidence,
				sources: titleSpan || match ? ["header"] : ["roleDefault"],
			}],
			unitCandidates: unit
				? [{
					canonicalUnit: unit,
					confidence,
					sources: ["header"],
					confirmed: false,
				}]
				: [],
		};
	});
};

const createXRangeAnalyses = ({
	columnCount,
	numericRuns,
	rows,
	titleSpans,
}: {
	readonly columnCount: number;
	readonly numericRuns: readonly NumericRun[];
	readonly rows: readonly (readonly string[])[];
	readonly titleSpans: readonly StructuredColumnTitleSpanEvidence[];
}): readonly XRangeAnalysis[] => {
	const titleSpansByRun = createTitleSpanByRun(titleSpans);
	const analyses: XRangeAnalysis[] = [];
	for (const run of numericRuns) {
		const titleSpan = titleSpansByRun.get(getRunKey(run));
		const pattern = analyzeNumericPattern(run.values);
		const confidence = scoreXRangeCandidate({
			columnCount,
			pattern,
			rows,
			run,
			titleSpan,
		});
		if (confidence < 0.45) {
			continue;
		}

		const reasons = createXRangeReasons(pattern, titleSpan, rows, run);
		analyses.push({
			run,
			candidate: {
				id: `x-range:c${run.column}:r${run.startRow}-${run.endRow}`,
				column: run.column,
				startRow: run.startRow,
				endRow: run.endRow,
				direction: pattern.direction,
				stepKind: pattern.stepKind,
				...(pattern.step !== undefined ? { step: pattern.step } : {}),
				pointCount: run.pointCount,
				confidence,
				reasons,
			},
		});
	}
	return analyses.sort((left, right) =>
		right.candidate.confidence - left.candidate.confidence ||
		left.candidate.column - right.candidate.column ||
		left.candidate.startRow - right.candidate.startRow
	);
};

const scoreXRangeCandidate = ({
	columnCount,
	pattern,
	rows,
	run,
	titleSpan,
}: {
	readonly columnCount: number;
	readonly pattern: NumericPatternAnalysis;
	readonly rows: readonly (readonly string[])[];
	readonly run: NumericRun;
	readonly titleSpan?: StructuredColumnTitleSpanEvidence;
}): number => {
	let confidence = 0.2 + run.coverage * 0.2;
	if (pattern.direction !== "mixed") {
		confidence += 0.18;
	}
	if (pattern.hasStableStep) {
		confidence += 0.25;
	} else if (pattern.stepKind === "ratioConstant") {
		confidence += 0.22;
	} else if (pattern.stepKind === "pointsDerived") {
		confidence += 0.1;
	}
	if (hasAlignedNumericNeighbor(rows, run, columnCount)) {
		confidence += 0.08;
	}
	if (titleSpan?.axisTendency === "x") {
		confidence += 0.25 * titleSpan.confidence;
	}
	if (titleSpan?.axisTendency === "dependent") {
		confidence -= 0.3 * titleSpan.confidence;
	}
	if (pattern.isConstantValue) {
		confidence -= 0.35;
	}
	if (run.pointCount < 3) {
		confidence -= 0.08;
	}
	if (!titleSpan && isPhysicalRowIndexLike(run)) {
		confidence -= 0.12;
	}
	return clampConfidence(confidence);
};

const createXRangeReasons = (
	pattern: NumericPatternAnalysis,
	titleSpan: StructuredColumnTitleSpanEvidence | undefined,
	rows: readonly (readonly string[])[],
	run: NumericRun,
): readonly string[] => {
	const reasons: string[] = ["xRange.numericRun"];
	if (pattern.direction !== "mixed") {
		reasons.push(`xRange.monotonic:${pattern.direction}`);
	}
	if (pattern.hasStableStep) {
		reasons.push(`xRange.step:${pattern.stepKind}`);
	}
	if (pattern.stepKind === "ratioConstant") {
		reasons.push("xRange.ratioConstant");
	}
	if (titleSpan?.axisTendency === "x") {
		reasons.push(`xRange.title:${titleSpan.canonicalRole}`);
	}
	if (hasAlignedNumericNeighbor(rows, run, Number.MAX_SAFE_INTEGER)) {
		reasons.push("xRange.alignedDependentNeighbor");
	}
	return reasons;
};

const createXGroupCandidates = (
	xRangeAnalyses: readonly XRangeAnalysis[],
): readonly StructuredXGroupCandidate[] => {
	const groups: StructuredXGroupCandidate[] = [];
	for (const analysis of xRangeAnalyses) {
		const ranges = splitMonotonicGroups(analysis.run.values);
		ranges.forEach((range, index) => {
			const startRow = analysis.run.startRow + range.startOffset;
			const endRow = analysis.run.startRow + range.endOffset;
			groups.push({
				id: `x-group:${analysis.candidate.id}:${index}`,
				xRangeCandidateId: analysis.candidate.id,
				startRow,
				endRow,
				direction: range.direction,
				groupKind: ranges.length === 1 ? "singleMonotonicRun" : range.groupKind,
				lineIndex: index,
				confidence: analysis.candidate.confidence,
				reasons: ranges.length === 1
					? ["xGroup.singleMonotonicRun"]
					: [`xGroup.${range.groupKind}`],
			});
		});
	}
	return groups;
};

const createDataBlockCandidates = ({
	columnCount,
	rows,
	titleSpans,
	xGroupCandidates,
	xRangeAnalyses,
}: {
	readonly columnCount: number;
	readonly rows: readonly (readonly string[])[];
	readonly titleSpans: readonly StructuredColumnTitleSpanEvidence[];
	readonly xGroupCandidates: readonly StructuredXGroupCandidate[];
	readonly xRangeAnalyses: readonly XRangeAnalysis[];
}): readonly StructuredDataBlockCandidate[] => {
	const titleSpansByColumn = createBestTitleSpanByColumn(titleSpans);
	const groupsByXRangeId = groupXGroupsByRangeId(xGroupCandidates);
	const strongX = xRangeAnalyses.filter(analysis => analysis.candidate.confidence >= BlockXConfidenceThreshold);
	const blocks: StructuredDataBlockCandidate[] = [];
	for (const analysis of strongX) {
		const right = scanDependentColumns({
			analysis,
			columnCount,
			direction: "right",
			rows,
			titleSpansByColumn,
			xRangeAnalyses: strongX,
		});
		const left = right.dependentColumns.length
			? emptyDependentScan
			: scanDependentColumns({
				analysis,
				columnCount,
				direction: "left",
				rows,
				titleSpansByColumn,
				xRangeAnalyses: strongX,
			});
		const dependentColumns = right.dependentColumns.length ? right.dependentColumns : left.dependentColumns;
		if (!dependentColumns.length) {
			continue;
		}

		const separatorColumns = [...right.separatorColumns, ...left.separatorColumns];
		const columns = [analysis.candidate.column, ...dependentColumns];
		const columnDirection = right.dependentColumns.length
			? "rightPreferred"
			: "leftObserved";
		const coverage = average(dependentColumns.map(column =>
			getNumericCoverage(rows, column, analysis.candidate.startRow, analysis.candidate.endRow)
		));
		const confidence = clampConfidence(
			analysis.candidate.confidence * 0.76 +
			coverage * 0.18 +
			(columnDirection === "rightPreferred" ? 0.06 : -0.05)
		);
		blocks.push({
			id: `data-block:${analysis.candidate.id}`,
			xRangeCandidateId: analysis.candidate.id,
			xGroupCandidateIds: groupsByXRangeId.get(analysis.candidate.id)?.map(group => group.id) ?? [],
			startRow: analysis.candidate.startRow,
			endRow: analysis.candidate.endRow,
			startCol: Math.min(...columns),
			endCol: Math.max(...columns),
			xColumn: analysis.candidate.column,
			dependentColumns,
			separatorColumns,
			columnDirection,
			confidence,
			reasons: [
				"dataBlock.fromXRange",
				`dataBlock.columnDirection:${columnDirection}`,
				...(separatorColumns.length ? ["dataBlock.separatorColumns"] : []),
			],
		});
	}
	return blocks.sort((left, right) =>
		left.startCol - right.startCol ||
		left.startRow - right.startRow
	);
};

const emptyDependentScan: {
	readonly dependentColumns: readonly number[];
	readonly separatorColumns: readonly number[];
} = {
	dependentColumns: [],
	separatorColumns: [],
};

const scanDependentColumns = ({
	analysis,
	columnCount,
	direction,
	rows,
	titleSpansByColumn,
	xRangeAnalyses,
}: {
	readonly analysis: XRangeAnalysis;
	readonly columnCount: number;
	readonly direction: "left" | "right";
	readonly rows: readonly (readonly string[])[];
	readonly titleSpansByColumn: ReadonlyMap<number, StructuredColumnTitleSpanEvidence>;
	readonly xRangeAnalyses: readonly XRangeAnalysis[];
}): {
	readonly dependentColumns: readonly number[];
	readonly separatorColumns: readonly number[];
} => {
	const dependentColumns: number[] = [];
	const separatorColumns: number[] = [];
	const step = direction === "right" ? 1 : -1;
	for (
		let column = analysis.candidate.column + step;
		column >= 0 && column < columnCount;
		column += step
	) {
		if (isSeparatorColumn(rows, column, analysis.candidate.startRow, analysis.candidate.endRow)) {
			separatorColumns.push(column);
			break;
		}
		if (
			dependentColumns.length &&
			isIndependentXBoundary({
				column,
				current: analysis,
				rows,
				titleSpansByColumn,
				xRangeAnalyses,
			})
		) {
			break;
		}

		const coverage = getNumericCoverage(rows, column, analysis.candidate.startRow, analysis.candidate.endRow);
		if (coverage >= 0.6) {
			dependentColumns.push(column);
			continue;
		}
		if (hasTextInRange(rows, column, analysis.candidate.startRow, analysis.candidate.endRow)) {
			break;
		}
	}
	return { dependentColumns, separatorColumns };
};

const isIndependentXBoundary = ({
	column,
	current,
	rows,
	titleSpansByColumn,
	xRangeAnalyses,
}: {
	readonly column: number;
	readonly current: XRangeAnalysis;
	readonly rows: readonly (readonly string[])[];
	readonly titleSpansByColumn: ReadonlyMap<number, StructuredColumnTitleSpanEvidence>;
	readonly xRangeAnalyses: readonly XRangeAnalysis[];
}): boolean => {
	const titleSpan = titleSpansByColumn.get(column);
	if (titleSpan?.axisTendency === "x") {
		return true;
	}
	const candidate = xRangeAnalyses.find(analysis =>
		analysis.candidate.column === column &&
		analysis.candidate.startRow === current.candidate.startRow &&
		analysis.candidate.endRow === current.candidate.endRow &&
		analysis.candidate.confidence >= BlockXConfidenceThreshold
	);
	return Boolean(candidate && haveSameNumericPattern(rows, current.candidate.column, column, current.candidate.startRow, current.candidate.endRow));
};

const createDependentValueCandidates = ({
	dataBlockCandidates,
	rows,
}: {
	readonly dataBlockCandidates: readonly StructuredDataBlockCandidate[];
	readonly rows: readonly (readonly string[])[];
}): readonly StructuredDependentValueCandidate[] => {
	const candidates: StructuredDependentValueCandidate[] = [];
	for (const block of dataBlockCandidates) {
		for (const column of block.dependentColumns) {
			const numericCoverage = getNumericCoverage(rows, column, block.startRow, block.endRow);
			candidates.push({
				id: `dependent:c${column}:${block.id}`,
				column,
				xRangeCandidateIds: [block.xRangeCandidateId],
				dataBlockCandidateIds: [block.id],
				numericCoverage,
				confidence: clampConfidence(block.confidence * 0.75 + numericCoverage * 0.25),
				reasons: ["dependent.boundToXRange", "dependent.insideDataBlock"],
			});
		}
	}
	return candidates;
};

const createBindingCandidates = ({
	dataBlockCandidates,
	dependentValueCandidates,
}: {
	readonly dataBlockCandidates: readonly StructuredDataBlockCandidate[];
	readonly dependentValueCandidates: readonly StructuredDependentValueCandidate[];
}): readonly StructuredBindingCandidate[] => {
	const dependentByBlockId = new Map<string, StructuredDependentValueCandidate[]>();
	for (const dependent of dependentValueCandidates) {
		for (const blockId of dependent.dataBlockCandidateIds) {
			const list = dependentByBlockId.get(blockId) ?? [];
			list.push(dependent);
			dependentByBlockId.set(blockId, list);
		}
	}

	const candidates: StructuredBindingCandidate[] = [];
	for (const block of dataBlockCandidates) {
		const dependentIds = dependentByBlockId.get(block.id)?.map(candidate => candidate.id) ?? [];
		if (!dependentIds.length) {
			continue;
		}
		candidates.push({
			id: `binding:${block.id}`,
			xRangeCandidateIds: [block.xRangeCandidateId],
			dependentValueCandidateIds: dependentIds,
			dataBlockCandidateIds: [block.id],
			relation: block.dependentColumns.length === 1 ? "oneX-oneY" : "oneX-manyY",
			confidence: block.confidence,
			ambiguityCodes: [],
			reasons: ["binding.fromDataBlock"],
		});
	}

	const pairwiseBlocks = dataBlockCandidates.filter(block =>
		block.dependentColumns.length === 1 &&
		block.columnDirection === "rightPreferred"
	);
	if (pairwiseBlocks.length > 1 && haveAlignedPairwiseBlocks(pairwiseBlocks)) {
		const blockIds = pairwiseBlocks.map(block => block.id);
		candidates.push({
			id: "binding:many-xy-pairs",
			xRangeCandidateIds: pairwiseBlocks.map(block => block.xRangeCandidateId),
			dependentValueCandidateIds: pairwiseBlocks.flatMap(block =>
				dependentByBlockId.get(block.id)?.map(candidate => candidate.id) ?? []
			),
			dataBlockCandidateIds: blockIds,
			relation: "manyXYpairs",
			confidence: clampConfidence(Math.min(...pairwiseBlocks.map(block => block.confidence)) + 0.04),
			ambiguityCodes: ["binding.pairwiseVsSharedX"],
			reasons: ["binding.manyXYpairs"],
		});
	}

	return candidates.sort((left, right) =>
		right.confidence - left.confidence ||
		right.dataBlockCandidateIds.length - left.dataBlockCandidateIds.length ||
		left.id.localeCompare(right.id)
	);
};

const haveAlignedPairwiseBlocks = (
	blocks: readonly StructuredDataBlockCandidate[],
): boolean => {
	const first = blocks[0];
	return Boolean(first) && blocks.every(block =>
		block.startRow === first.startRow &&
		block.endRow === first.endRow &&
		block.endCol === block.xColumn + 1
	);
};

const createStructuredContentStructure = ({
	columnCount,
	dataBlockCandidates,
	numericRuns,
	rowCount,
	titleSpans,
}: {
	readonly columnCount: number;
	readonly dataBlockCandidates: readonly StructuredDataBlockCandidate[];
	readonly numericRuns: readonly NumericRun[];
	readonly rowCount: number;
	readonly titleSpans: readonly StructuredColumnTitleSpanEvidence[];
}): StructuredContentStructure => {
	if (!numericRuns.length || rowCount <= 0 || columnCount <= 0) {
		return createEmptyStructuredContentStructure();
	}

	const headerRows = [...new Map(titleSpans.map(span => [span.titleCell.row, span])).values()]
		.map(span => ({
			rowIndex: span.titleCell.row,
			range: {
				startRow: span.titleCell.row,
				endRow: span.titleCell.row,
				startCol: 0,
				endCol: Math.max(0, columnCount - 1),
			},
			confidence: span.confidence,
			source: "measurementHeader" as const,
		}));
	const dataRegions = dataBlockCandidates.length
		? dataBlockCandidates.map(block => ({
			id: `data-region:${block.id}`,
			range: {
				startRow: block.startRow,
				endRow: block.endRow,
				startCol: block.startCol,
				endCol: block.endCol,
			},
			rowCount: block.endRow - block.startRow + 1,
			columnCount: block.endCol - block.startCol + 1,
		}))
		: [createFallbackDataRegion(numericRuns)];
	const blockRegions = dataBlockCandidates.length
		? dataBlockCandidates.map(block => ({
			id: `block-region:${block.id}`,
			range: {
				startRow: block.startRow,
				endRow: block.endRow,
				startCol: block.startCol,
				endCol: block.endCol,
			},
			kind: "single" as const,
		}))
		: [];
	return {
		headerRows,
		unitRows: [],
		dataRegions,
		blockRegions,
		fingerprint: createStructureFingerprint({
			columnCount,
			dataBlockCandidates,
			rowCount,
			titleSpans,
		}),
	};
};

const createFallbackDataRegion = (
	numericRuns: readonly NumericRun[],
) => {
	const startRow = Math.min(...numericRuns.map(run => run.startRow));
	const endRow = Math.max(...numericRuns.map(run => run.endRow));
	const startCol = Math.min(...numericRuns.map(run => run.column));
	const endCol = Math.max(...numericRuns.map(run => run.column));
	return {
		id: "data-region:numeric-runs",
		range: {
			startRow,
			endRow,
			startCol,
			endCol,
		},
		rowCount: endRow - startRow + 1,
		columnCount: endCol - startCol + 1,
	};
};

const createStructureFingerprint = ({
	columnCount,
	dataBlockCandidates,
	rowCount,
	titleSpans,
}: {
	readonly columnCount: number;
	readonly dataBlockCandidates: readonly StructuredDataBlockCandidate[];
	readonly rowCount: number;
	readonly titleSpans: readonly StructuredColumnTitleSpanEvidence[];
}): string => [
	"data-resource-structure",
	rowCount,
	columnCount,
	dataResourceSemanticLibraryFingerprint,
	dataBlockCandidates.map(block => [
		block.startRow,
		block.endRow,
		block.startCol,
		block.endCol,
		block.xColumn,
		block.dependentColumns.join(","),
	].join(":")).join("|"),
	titleSpans.map(span => [
		span.targetColumn,
		span.canonicalRole,
		span.axisTendency,
	].join(":")).join("|"),
].join("\u001f");

const createStructuredMeasurementBlocks = ({
	columnProfiles,
	content,
	dataBlockCandidates,
	titleSpans,
}: {
	readonly columnProfiles: readonly StructuredColumnProfile[];
	readonly content: TableModelContentSnapshot;
	readonly dataBlockCandidates: readonly StructuredDataBlockCandidate[];
	readonly titleSpans: readonly StructuredColumnTitleSpanEvidence[];
}): readonly StructuredMeasurementBlockRecord[] => {
	const titleSpansByColumn = createBestTitleSpanByColumn(titleSpans);
	return dataBlockCandidates.map((block): StructuredMeasurementBlockRecord => {
		const measurement = inferMeasurementForBlock(block, titleSpansByColumn);
		const headerRows = block.dependentColumns
			.map(column => titleSpansByColumn.get(column)?.titleCell.row)
			.concat(titleSpansByColumn.get(block.xColumn)?.titleCell.row)
			.filter((row): row is number => Number.isInteger(row));
		const titleRow = headerRows.length ? Math.min(...headerRows) : undefined;
		const dataRange = {
			startRow: block.startRow,
			endRow: block.endRow,
			startCol: block.startCol,
			endCol: block.endCol,
		};
		return {
			id: block.id,
			fileId: "uri-file",
			rawTableId: "uri-table",
			label: getStructuredMeasurementLabel(measurement),
			family: measurement.family,
			...(measurement.ivMode ? { ivMode: measurement.ivMode } : {}),
			source: {
				fullRange: createStructuredContentFullRange(content),
				...(titleRow !== undefined ? {
					headerRange: {
						startRow: titleRow,
						endRow: titleRow,
						startCol: block.startCol,
						endCol: block.endCol,
					},
					titleRange: {
						startRow: titleRow,
						endRow: titleRow,
						startCol: block.startCol,
						endCol: block.endCol,
					},
				} : {}),
				dataRange,
			},
			columns: {
				columns: [block.xColumn, ...block.dependentColumns].map(column =>
					createMeasurementColumnRef({
						block,
						column,
						columnProfiles,
						isX: column === block.xColumn,
						titleSpan: titleSpansByColumn.get(column),
					})
				),
			},
			rowCount: block.endRow - block.startRow + 1,
			columnCount: block.endCol - block.startCol + 1,
			confidence: block.confidence,
			diagnosticCodes: [],
		};
	});
};

const createMeasurementColumnRef = ({
	block,
	column,
	columnProfiles,
	isX,
	titleSpan,
}: {
	readonly block: StructuredDataBlockCandidate;
	readonly column: number;
	readonly columnProfiles: readonly StructuredColumnProfile[];
	readonly isX: boolean;
	readonly titleSpan?: StructuredColumnTitleSpanEvidence;
}): StructuredMeasurementColumnRef => {
	const profile = columnProfiles.find(candidate => candidate.rawCol === column);
	const role = titleSpan?.canonicalRole ?? (isX ? "unknown" : "unknown");
	return {
		rawCol: column,
		headerText: profile?.headerText ?? getFallbackColumnHeaderText(column),
		role,
		unit: titleSpan?.canonicalUnit ?? null,
		dataRange: {
			startRow: block.startRow,
			endRow: block.endRow,
			startCol: column,
			endCol: column,
		},
		sourceRange: {
			startRow: titleSpan?.titleCell.row ?? block.startRow,
			endRow: block.endRow,
			startCol: column,
			endCol: column,
		},
		confidence: titleSpan?.confidence ?? (isX ? block.confidence : 0.6),
	};
};

const inferMeasurementForBlock = (
	block: StructuredDataBlockCandidate,
	titleSpansByColumn: ReadonlyMap<number, StructuredColumnTitleSpanEvidence>,
): {
	readonly family: StructuredMeasurementFamily;
	readonly ivMode?: StructuredMeasurementBlockRecord["ivMode"];
} => {
	const xRole = titleSpansByColumn.get(block.xColumn)?.canonicalRole;
	const dependentRoles = block.dependentColumns.map(column => titleSpansByColumn.get(column)?.canonicalRole);
	if (dependentRoles.some(role => role === "id" || role === "current" || role === "ig" || role === "is")) {
		if (xRole === "vg") {
			return { family: "iv", ivMode: "transfer" };
		}
		if (xRole === "vd") {
			return { family: "iv", ivMode: "output" };
		}
		if (xRole === "time") {
			return { family: "it" };
		}
	}
	if (dependentRoles.some(role => role === "capacitance")) {
		if (xRole === "frequency") {
			return { family: "cf" };
		}
		if (xRole === "vg" || xRole === "vd" || xRole === "voltage") {
			return { family: "cv" };
		}
	}
	return { family: "unknown" };
};

const createEvidenceDiagnostics = ({
	bindingCandidates,
	columnCount,
	numericRuns,
	rowCount,
}: {
	readonly bindingCandidates: readonly StructuredBindingCandidate[];
	readonly columnCount: number;
	readonly numericRuns: readonly NumericRun[];
	readonly rowCount: number;
}): readonly StructuredContentDiagnostic[] => {
	if (bindingCandidates.length) {
		return [];
	}
	if (!numericRuns.length) {
		return [{
			severity: "warning",
			code: "dataResource.noNumericRuns",
			message: "No continuous numeric runs were detected for automatic data binding.",
			sourceRange: {
				startRow: 0,
				endRow: Math.max(0, rowCount - 1),
				startCol: 0,
				endCol: Math.max(0, columnCount - 1),
			},
		}];
	}
	return [{
		severity: "warning",
		code: "dataResource.ambiguousNumericContent",
		message: "Numeric content was detected, but no high-confidence X/value binding was found.",
		sourceRange: {
			startRow: 0,
			endRow: Math.max(0, rowCount - 1),
			startCol: 0,
			endCol: Math.max(0, columnCount - 1),
		},
	}];
};

const analyzeNumericPattern = (
	values: readonly number[],
): NumericPatternAnalysis => {
	const diffs = createDiffs(values);
	const direction = getDirection(diffs);
	const monotonicity = getMonotonicity(diffs, direction);
	const isConstantValue = values.length > 1 && values.every(value => nearlyEqual(value, values[0] ?? 0));
	const stableDelta = getStableDelta(diffs);
	const stableRatio = getStableRatio(values);
	const groups = splitMonotonicGroups(values);
	const segmentedConstant = groups.length > 1 && groups.every(group => {
		const groupValues = values.slice(group.startOffset, group.endOffset + 1);
		return Boolean(getStableDelta(createDiffs(groupValues)));
	});
	if (stableDelta) {
		return {
			direction,
			monotonicity,
			stepKind: stableDelta.kind,
			step: stableDelta.step,
			isConstantValue,
			hasStableStep: true,
		};
	}
	if (segmentedConstant) {
		return {
			direction,
			monotonicity,
			stepKind: "segmentedConstant",
			isConstantValue,
			hasStableStep: true,
		};
	}
	if (stableRatio) {
		return {
			direction,
			monotonicity,
			stepKind: "ratioConstant",
			isConstantValue,
			hasStableStep: false,
		};
	}
	return {
		direction,
		monotonicity,
		stepKind: "pointsDerived",
		isConstantValue,
		hasStableStep: direction !== "mixed" && monotonicity >= 0.98,
	};
};

const createDiffs = (
	values: readonly number[],
): readonly number[] => {
	const diffs: number[] = [];
	for (let index = 1; index < values.length; index += 1) {
		diffs.push((values[index] ?? 0) - (values[index - 1] ?? 0));
	}
	return diffs;
};

const getDirection = (
	diffs: readonly number[],
): StructuredXRangeDirection => {
	const nonZero = diffs.filter(diff => Math.abs(diff) > NumberTolerance);
	if (!nonZero.length) {
		return "mixed";
	}
	if (nonZero.every(diff => diff > 0)) {
		return "ascending";
	}
	if (nonZero.every(diff => diff < 0)) {
		return "descending";
	}
	return "mixed";
};

const getMonotonicity = (
	diffs: readonly number[],
	direction: StructuredXRangeDirection,
): number => {
	if (!diffs.length || direction === "mixed") {
		return 0;
	}
	const expectedSign = direction === "ascending" ? 1 : -1;
	const matching = diffs.filter(diff => Math.abs(diff) <= NumberTolerance || Math.sign(diff) === expectedSign).length;
	return matching / diffs.length;
};

const getStableDelta = (
	diffs: readonly number[],
): { readonly kind: "constant" | "nearlyConstant"; readonly step: number } | null => {
	const nonZero = diffs.filter(diff => Math.abs(diff) > NumberTolerance);
	if (!nonZero.length) {
		return null;
	}
	const step = average(nonZero);
	const maxDeviation = Math.max(...nonZero.map(diff => Math.abs(diff - step)));
	const tolerance = Math.max(NumberTolerance, Math.abs(step) * 1e-6);
	if (maxDeviation <= tolerance) {
		return { kind: "constant", step };
	}
	const meanAbs = average(nonZero.map(diff => Math.abs(diff)));
	if (meanAbs > 0 && maxDeviation / meanAbs <= 0.02) {
		return { kind: "nearlyConstant", step };
	}
	return null;
};

const getStableRatio = (
	values: readonly number[],
): boolean => {
	const ratios: number[] = [];
	for (let index = 1; index < values.length; index += 1) {
		const previous = values[index - 1] ?? 0;
		const current = values[index] ?? 0;
		if (Math.abs(previous) <= NumberTolerance || Math.abs(current) <= NumberTolerance) {
			return false;
		}
		ratios.push(current / previous);
	}
	if (ratios.length < 2) {
		return false;
	}
	const ratio = average(ratios);
	const maxDeviation = Math.max(...ratios.map(value => Math.abs(value - ratio)));
	return Math.abs(ratio) > NumberTolerance && maxDeviation / Math.abs(ratio) <= 0.02;
};

const splitMonotonicGroups = (
	values: readonly number[],
): readonly GroupRange[] => {
	if (values.length <= 1) {
		return [{
			startOffset: 0,
			endOffset: 0,
			direction: "ascending",
			groupKind: "singleMonotonicRun",
		}];
	}

	const groups: GroupRange[] = [];
	let startOffset = 0;
	let direction: Exclude<StructuredXRangeDirection, "mixed"> | null = null;
	let currentGroupKind: GroupRange["groupKind"] = "singleMonotonicRun";
	for (let index = 1; index < values.length; index += 1) {
		const diff = (values[index] ?? 0) - (values[index - 1] ?? 0);
		if (Math.abs(diff) <= NumberTolerance) {
			continue;
		}
		const nextDirection: Exclude<StructuredXRangeDirection, "mixed"> = diff > 0 ? "ascending" : "descending";
		if (!direction) {
			direction = nextDirection;
			continue;
		}
		if (nextDirection !== direction) {
			const followingDirection = findNextNonZeroDirection(values, index + 1);
			if (followingDirection === direction) {
				groups.push({
					startOffset,
					endOffset: index - 1,
					direction,
					groupKind: "reset",
				});
				startOffset = index;
				direction = null;
				currentGroupKind = "reset";
				continue;
			}
			groups.push({
				startOffset,
				endOffset: index - 1,
				direction,
				groupKind: currentGroupKind === "reset" ? "reset" : "directionBreak",
			});
			startOffset = index - 1;
			direction = nextDirection;
			currentGroupKind = "directionBreak";
		}
	}
	groups.push({
		startOffset,
		endOffset: values.length - 1,
		direction: direction ?? "ascending",
		groupKind: groups.length ? currentGroupKind : "singleMonotonicRun",
	});
	return groups;
};

const findNextNonZeroDirection = (
	values: readonly number[],
	startIndex: number,
): Exclude<StructuredXRangeDirection, "mixed"> | null => {
	for (let index = startIndex; index < values.length; index += 1) {
		const diff = (values[index] ?? 0) - (values[index - 1] ?? 0);
		if (Math.abs(diff) <= NumberTolerance) {
			continue;
		}
		return diff > 0 ? "ascending" : "descending";
	}
	return null;
};

const getColumnKind = (
	rows: readonly (readonly string[])[],
	column: number,
): StructuredColumnProfile["kind"] => {
	let hasNumber = false;
	let hasText = false;
	for (const row of rows) {
		const value = normalizeText(row[column]);
		if (!value) {
			continue;
		}
		if (parseFiniteNumber(value) !== null) {
			hasNumber = true;
		} else {
			hasText = true;
		}
	}
	if (!hasNumber && !hasText) {
		return "empty";
	}
	if (hasNumber && hasText) {
		return "mixed";
	}
	return hasNumber ? "numeric" : "text";
};

const createColumnNumericStats = (
	run: NumericRun,
): NonNullable<StructuredColumnProfile["numericStats"]> => {
	const values = run.values;
	const finiteValues = values.filter(Number.isFinite);
	const absValues = finiteValues.map(value => Math.abs(value)).sort((left, right) => left - right);
	const min = Math.min(...finiteValues);
	const max = Math.max(...finiteValues);
	const exponents = finiteValues
		.filter(value => Math.abs(value) > NumberTolerance)
		.map(value => Math.floor(Math.log10(Math.abs(value))));
	const pattern = analyzeNumericPattern(values);
	return {
		sampleCount: run.pointCount,
		finiteCount: finiteValues.length,
		min,
		max,
		medianAbs: absValues[Math.floor(absValues.length / 2)] ?? 0,
		exponentMin: exponents.length ? Math.min(...exponents) : 0,
		exponentMax: exponents.length ? Math.max(...exponents) : 0,
		monotonicity: pattern.monotonicity,
		uniqueRatio: new Set(finiteValues.map(value => String(value))).size / Math.max(1, finiteValues.length),
		span: max - min,
	};
};

const createLongestRunsByColumn = (
	numericRuns: readonly NumericRun[],
): ReadonlyMap<number, NumericRun> => {
	const result = new Map<number, NumericRun>();
	for (const run of numericRuns) {
		const existing = result.get(run.column);
		if (!existing || run.pointCount > existing.pointCount) {
			result.set(run.column, run);
		}
	}
	return result;
};

const createBestTitleSpanByColumn = (
	titleSpans: readonly StructuredColumnTitleSpanEvidence[],
): ReadonlyMap<number, StructuredColumnTitleSpanEvidence> => {
	const result = new Map<number, StructuredColumnTitleSpanEvidence>();
	for (const span of titleSpans) {
		const existing = result.get(span.targetColumn);
		if (!existing || span.confidence > existing.confidence || span.startRow < existing.startRow) {
			result.set(span.targetColumn, span);
		}
	}
	return result;
};

const createTitleSpanByRun = (
	titleSpans: readonly StructuredColumnTitleSpanEvidence[],
): ReadonlyMap<string, StructuredColumnTitleSpanEvidence> => {
	const result = new Map<string, StructuredColumnTitleSpanEvidence>();
	for (const span of titleSpans) {
		result.set(getRunKey({
			column: span.targetColumn,
			startRow: span.startRow,
			endRow: span.endRow,
		}), span);
	}
	return result;
};

const getRunKey = (
	run: Pick<NumericRun, "column" | "startRow" | "endRow">,
): string => `${run.column}:${run.startRow}:${run.endRow}`;

const groupXGroupsByRangeId = (
	groups: readonly StructuredXGroupCandidate[],
): ReadonlyMap<string, readonly StructuredXGroupCandidate[]> => {
	const result = new Map<string, StructuredXGroupCandidate[]>();
	for (const group of groups) {
		const list = result.get(group.xRangeCandidateId) ?? [];
		list.push(group);
		result.set(group.xRangeCandidateId, list);
	}
	return result;
};

const hasAlignedNumericNeighbor = (
	rows: readonly (readonly string[])[],
	run: NumericRun,
	columnCount: number,
): boolean => {
	for (const column of [run.column - 1, run.column + 1]) {
		if (column < 0 || column >= columnCount) {
			continue;
		}
		if (getNumericCoverage(rows, column, run.startRow, run.endRow) >= 0.6) {
			return true;
		}
	}
	return false;
};

const getNumericCoverage = (
	rows: readonly (readonly string[])[],
	column: number,
	startRow: number,
	endRow: number,
): number => {
	let numeric = 0;
	let total = 0;
	for (let rowIndex = startRow; rowIndex <= endRow; rowIndex += 1) {
		total += 1;
		if (parseFiniteNumber(rows[rowIndex]?.[column]) !== null) {
			numeric += 1;
		}
	}
	return total ? numeric / total : 0;
};

const isSeparatorColumn = (
	rows: readonly (readonly string[])[],
	column: number,
	startRow: number,
	endRow: number,
): boolean => {
	for (let rowIndex = startRow; rowIndex <= endRow; rowIndex += 1) {
		if (normalizeText(rows[rowIndex]?.[column])) {
			return false;
		}
	}
	return true;
};

const hasTextInRange = (
	rows: readonly (readonly string[])[],
	column: number,
	startRow: number,
	endRow: number,
): boolean => {
	for (let rowIndex = startRow; rowIndex <= endRow; rowIndex += 1) {
		const value = normalizeText(rows[rowIndex]?.[column]);
		if (value && parseFiniteNumber(value) === null) {
			return true;
		}
	}
	return false;
};

const haveSameNumericPattern = (
	rows: readonly (readonly string[])[],
	leftColumn: number,
	rightColumn: number,
	startRow: number,
	endRow: number,
): boolean => {
	const leftValues = readNumericValues(rows, leftColumn, startRow, endRow);
	const rightValues = readNumericValues(rows, rightColumn, startRow, endRow);
	if (leftValues.length !== rightValues.length || leftValues.length < 2) {
		return false;
	}
	const leftDiffs = createDiffs(leftValues);
	const rightDiffs = createDiffs(rightValues);
	if (leftDiffs.length !== rightDiffs.length) {
		return false;
	}
	return leftDiffs.every((diff, index) => nearlyEqual(diff, rightDiffs[index] ?? Number.NaN));
};

const readNumericValues = (
	rows: readonly (readonly string[])[],
	column: number,
	startRow: number,
	endRow: number,
): readonly number[] => {
	const values: number[] = [];
	for (let rowIndex = startRow; rowIndex <= endRow; rowIndex += 1) {
		const value = parseFiniteNumber(rows[rowIndex]?.[column]);
		if (value !== null) {
			values.push(value);
		}
	}
	return values;
};

const isPhysicalRowIndexLike = (
	run: NumericRun,
): boolean => run.values.every((value, index) =>
	nearlyEqual(value, run.startRow + index) ||
	nearlyEqual(value, run.startRow + index + 1) ||
	nearlyEqual(value, index) ||
	nearlyEqual(value, index + 1)
);

const getRowNumericCount = (
	row: readonly string[],
): number =>
	row.reduce((count, cell) => count + (parseFiniteNumber(cell) !== null ? 1 : 0), 0);

const getFallbackColumnHeaderText = (
	column: number,
): string => `Column ${column + 1}`;

const createStructuredContentFullRange = (
	content: TableModelContentSnapshot,
): StructuredContentSourceRange => ({
	startRow: 0,
	endRow: Math.max(0, content.rowCount - 1),
	startCol: 0,
	endCol: Math.max(0, content.columnCount - 1),
});

const getStructuredMeasurementLabel = (
	measurement: {
		readonly family: StructuredMeasurementFamily;
		readonly ivMode?: StructuredMeasurementBlockRecord["ivMode"];
	},
): string => {
	if (measurement.family === "iv" && measurement.ivMode === "transfer") {
		return "Detected IV Transfer";
	}
	if (measurement.family === "iv" && measurement.ivMode === "output") {
		return "Detected IV Output";
	}
	if (measurement.family !== "unknown") {
		return `Detected ${measurement.family.toUpperCase()}`;
	}
	return "Detected Data Block";
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

const parseFiniteNumber = (
	value: unknown,
): number | null => {
	const text = normalizeText(value).replace(/,/g, "");
	if (!text) {
		return null;
	}
	const number = Number(text);
	return Number.isFinite(number) ? number : null;
};

const nearlyEqual = (
	left: number,
	right: number,
): boolean => Math.abs(left - right) <= Math.max(NumberTolerance, Math.max(Math.abs(left), Math.abs(right)) * 1e-9);

const average = (
	values: readonly number[],
): number => values.length
	? values.reduce((sum, value) => sum + value, 0) / values.length
	: 0;

const clampConfidence = (
	value: number,
): number => Math.max(0, Math.min(1, value));

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
