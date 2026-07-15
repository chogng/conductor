/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, type Event } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import type { URI } from "src/cs/base/common/uri";
import { parseFiniteNumber } from "src/cs/workbench/common/cellText";
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
	createSemanticMatcher,
	toSemanticTermKey,
	type SemanticMatcher,
} from "src/cs/workbench/services/dataResource/common/semanticRules";
import {
	createEmptyStructuredContentStructure,
	getStructuredContentColumnFacts,
	getStructuredContentFingerprint,
	readStructuredContentRows,
	type StructuredAxisTendency,
	type StructuredBindingCandidate,
	type StructuredColumnProfile,
	type StructuredColumnSemanticCandidate,
	type StructuredColumnTitleSpanEvidence,
	type StructuredContentColumnFacts,
	type StructuredContentDiagnostic,
	type StructuredContentEvidence,
	type StructuredContentSourceRange,
	type StructuredContentStructure,
	type StructuredDataBlockCandidate,
	type StructuredDependentValueCandidate,
	type StructuredInfoCellNeighborhoodEvidence,
	type StructuredMeasurementBlockRecord,
	type StructuredMeasurementColumnRef,
	type StructuredMeasurementFamily,
	type StructuredXAxisIntent,
	type StructuredXAxisRole,
	type StructuredXGroupCandidate,
	type StructuredXRangeCandidate,
	type StructuredXRangeDirection,
	type StructuredXRangeStepKind,
} from "src/cs/workbench/services/dataResource/common/structuredContent";
import {
	createStructuredBlockSegments,
	type StructuredBlockSegment,
} from "src/cs/workbench/services/dataResource/common/structuredBlockSegmentation";
import { IStructuredContentEvidenceService } from "src/cs/workbench/services/dataResource/common/structuredContentEvidenceService";
import {
	ISettingsService,
	normalizeTemplateSemanticPatches,
	type TemplateSemanticPatches,
} from "src/cs/workbench/services/settings/common/settings";
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
	readonly values: NumericValues;
	readonly coverage: number;
	readonly pointCount: number;
};

type NumericValues = readonly number[] | Float64Array;

type NumericRunTitleCell = {
	readonly run: NumericRun;
	readonly titleCell: StructuredColumnTitleSpanEvidence["titleCell"];
};

type ExplicitDataRowRange = {
	readonly markerColumn: number;
	readonly titleRow: number;
	readonly startRow: number;
	readonly endRow: number;
};

type RepeatedPairTitleInterpretation = {
	readonly reasons: readonly string[];
	readonly semanticTitle: string;
};

type BlockRuleCandidate = {
	readonly id: string;
	readonly label: string;
	readonly type?: string;
	readonly directPairScore: number;
	readonly priorityIndex: number;
	readonly proofEvidenceCount: number;
	readonly proofScore: number;
};

type HeaderSemanticMatch = NonNullable<ReturnType<SemanticMatcher["matchTitle"]>>;
type HeaderSemanticRuleMatch = HeaderSemanticMatch["semanticRules"][number];

type XRangeAnalysis = {
	readonly candidate: StructuredXRangeCandidate;
	readonly run: NumericRun;
};

type XRangeDraft = {
	readonly baseConfidence: number;
	readonly pattern: NumericPatternAnalysis;
	readonly run: NumericRun;
	readonly titleSpan?: StructuredColumnTitleSpanEvidence;
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
const ProofColumnAbsoluteTolerance = 1e-12;

export class DataResourceService extends Disposable implements IDataResourceService {
	public declare readonly _serviceBrand: undefined;

	private readonly onDidChangeResourceEmitter = this._register(new Emitter<URI>());
	public readonly onDidChangeResource: Event<URI> = this.onDidChangeResourceEmitter.event;
	private readonly trackedResources = new Map<string, URI>();
	private readonly structuredContentSignaturesByResourceKey = new Map<string, string>();
	private semanticMatcher: SemanticMatcher;
	private semanticPatches: TemplateSemanticPatches;
	private semanticSettingsFingerprint = "";

	public constructor(
		@ITableModelService private readonly tableModelService: ITableModelServiceType,
		@ISettingsService private readonly settingsService: ISettingsService,
		@IStructuredContentEvidenceService private readonly structuredContentEvidenceService: IStructuredContentEvidenceService,
	) {
		super();

		this._register({
			dispose: () => {
				this.trackedResources.clear();
				this.structuredContentSignaturesByResourceKey.clear();
			},
		});
		const semanticConfiguration = this.createSettingsSemanticConfiguration();
		this.semanticMatcher = semanticConfiguration.matcher;
		this.semanticPatches = semanticConfiguration.patches;
		this.semanticSettingsFingerprint = this.semanticMatcher.fingerprint;
		this._register(this.tableModelService.onDidChangeModel(model => {
			if (this.rememberStableStructuredContentSignature(model.getSnapshot())) {
				this.onDidChangeResourceEmitter.fire(model.resource);
			}
		}));
		this._register(this.settingsService.onDidChangeConductorSettings(() => {
			const nextConfiguration = this.createSettingsSemanticConfiguration();
			const nextMatcher = nextConfiguration.matcher;
			const nextFingerprint = nextMatcher.fingerprint;
			if (nextFingerprint === this.semanticSettingsFingerprint) {
				return;
			}
			this.semanticMatcher = nextMatcher;
			this.semanticPatches = nextConfiguration.patches;
			this.semanticSettingsFingerprint = nextFingerprint;
			for (const resource of this.trackedResources.values()) {
				this.onDidChangeResourceEmitter.fire(resource);
			}
		}));
	}

	public canHandleResource(resource: URI): boolean {
		return this.tableModelService.canHandleResource(resource);
	}

	public async resolveStructuredContent(
		target: DataResourceStructuredContentTarget,
	): Promise<IDataResourceStructuredContentReference> {
		this.trackResource(target.resource);
		const reference = await this.tableModelService.createModelReference(
			target.resource,
			createStructuredContentSource(target),
		);
		let snapshot = reference.object.getSnapshot();
		let resolution: DataResourceStructuredContentResolution;
		while (true) {
			this.rememberStableStructuredContentSignature(snapshot);
			const semanticSettingsFingerprint = this.semanticSettingsFingerprint;
			resolution = await createStructuredContentResolution(
				snapshot,
				target,
				this.semanticPatches,
				this.structuredContentEvidenceService,
			);
			const currentSnapshot = reference.object.getSnapshot();
			if (
				currentSnapshot.version === snapshot.version &&
				currentSnapshot.sourceVersion === snapshot.sourceVersion &&
				semanticSettingsFingerprint === this.semanticSettingsFingerprint
			) {
				break;
			}
			snapshot = currentSnapshot;
		}
		return {
			object: resolution,
			dispose: () => {
				reference.dispose();
			},
		};
	}

	public resolve(target: DataResourceStructuredContentTarget): void {
		this.trackResource(target.resource);
		this.tableModelService.resolve(target.resource, createStructuredContentSource(target));
	}

	private createSettingsSemanticConfiguration(): {
		readonly matcher: SemanticMatcher;
		readonly patches: TemplateSemanticPatches;
	} {
		const settings = this.settingsService.getConductorSettings();
		const patches = normalizeTemplateSemanticPatches(settings?.templateSemanticPatches);
		return {
			matcher: createSemanticMatcher({ patches }),
			patches,
		};
	}

	private trackResource(resource: URI): string {
		const resourceKey = normalizeResourceIdentity(resource);
		this.trackedResources.set(resourceKey, resource);
		return resourceKey;
	}

	private rememberStableStructuredContentSignature(snapshot: TableModelSnapshot): boolean {
		const signature = createStableStructuredContentSignature(snapshot, this.semanticSettingsFingerprint);
		if (!signature) {
			this.trackResource(snapshot.resource);
			return false;
		}

		const resourceKey = this.trackResource(snapshot.resource);
		const previousSignature = this.structuredContentSignaturesByResourceKey.get(resourceKey);
		this.structuredContentSignaturesByResourceKey.set(resourceKey, signature);
		return previousSignature !== undefined && previousSignature !== signature;
	}
}

const createStructuredContentResolution = async (
	snapshot: TableModelSnapshot,
	target: DataResourceStructuredContentTarget,
	semanticPatches: TemplateSemanticPatches,
	structuredContentEvidenceService: IStructuredContentEvidenceService,
): Promise<DataResourceStructuredContentResolution> => {
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
	const evidence = await structuredContentEvidenceService.create(content, semanticPatches);
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

const createStableStructuredContentSignature = (
	snapshot: TableModelSnapshot,
	semanticSettingsFingerprint: string,
): string | null => {
	const state = snapshot.loadState.state;
	if (state !== "ready" && state !== "error") {
		return null;
	}

	const builder = createSignatureBuilder();
	builder.append(state);
	builder.append(semanticSettingsFingerprint);
	builder.append(snapshot.sourceVersion);
	builder.append(snapshot.format ?? "");
	builder.append(snapshot.defaultSheetId ?? "");
	appendDiagnosticsSignature(builder, snapshot.diagnostics);
	if (state === "error") {
		builder.append(snapshot.loadState.message);
		return builder.digest();
	}

	appendContentSignature(builder, snapshot.content);
	builder.append(snapshot.sheets.length);
	for (const sheet of snapshot.sheets) {
		builder.append(sheet.sheetId);
		builder.append(sheet.sheetName ?? "");
		appendDiagnosticsSignature(builder, sheet.diagnostics ?? []);
		appendContentSignature(builder, sheet.content);
	}
	return builder.digest();
};

const createSignatureBuilder = () => {
	let hash = 2166136261;
	const appendText = (value: string): void => {
		for (let index = 0; index < value.length; index += 1) {
			hash ^= value.charCodeAt(index);
			hash = Math.imul(hash, 16777619);
		}
		hash ^= 31;
		hash = Math.imul(hash, 16777619);
	};
	return {
		append(value: unknown): void {
			appendText(String(value ?? ""));
		},
		digest(): string {
			return (hash >>> 0).toString(36);
		},
	};
};

const appendDiagnosticsSignature = (
	builder: ReturnType<typeof createSignatureBuilder>,
	diagnostics: readonly TableParseDiagnostic[],
): void => {
	builder.append(diagnostics.length);
	for (const diagnostic of diagnostics) {
		builder.append(diagnostic.code);
		builder.append(diagnostic.message);
		builder.append(diagnostic.severity);
		builder.append(diagnostic.rowIndex ?? "");
		builder.append(diagnostic.columnIndex ?? "");
		builder.append(diagnostic.sheetId ?? "");
	}
};

const appendContentSignature = (
	builder: ReturnType<typeof createSignatureBuilder>,
	content: TableModelContentSnapshot | null,
): void => {
	if (!content) {
		builder.append("null");
		return;
	}

	builder.append(getStructuredContentFingerprint(content));
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

export const createStructuredContentEvidence = (
	content: TableModelContentSnapshot,
	semanticMatcher: SemanticMatcher,
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
		const columnFacts = getStructuredContentColumnFacts(content);
		const blockSegments = createStructuredBlockSegments({
			columnFacts,
			rows,
		});
		const explicitDataRowRanges = createExplicitDataRowRanges(rows, semanticMatcher);
		const numericRuns = createNumericRuns(columnFacts);
		const baseColumnTitleSpans = createColumnTitleSpanEvidence({
			numericRuns,
			rows,
			semanticMatcher,
		});
		const infoCellNeighborhoods = createInfoCellNeighborhoodEvidence({
			rows,
			semanticMatcher,
			titleSpans: baseColumnTitleSpans,
		});
		const columnTitleSpans = applyInfoCellNeighborhoodEvidenceToTitleSpans({
			neighborhoods: infoCellNeighborhoods,
			titleSpans: baseColumnTitleSpans,
		});
		const columnProfiles = createColumnProfiles({
			columnCount: content.columnCount,
			columnKinds: columnFacts.map(facts => facts.kind),
			numericRuns,
			semanticMatcher,
			titleSpans: columnTitleSpans,
		});
		const semanticCandidates = createColumnSemanticCandidates({
			columnProfiles,
			semanticMatcher,
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
		const dataBlockCandidates = applyExplicitDataRowBoundaryEvidence({
			blocks: createDataBlockCandidates({
				blockSegments,
				columnCount: content.columnCount,
				explicitDataRowRanges,
				rows,
				titleSpans: columnTitleSpans,
				xGroupCandidates,
				xRangeAnalyses,
			}),
			explicitDataRowRanges,
		});
		const dependentValueCandidates = createDependentValueCandidates({
			dataBlockCandidates,
			rows,
		});
		const bindingCandidates = createBindingCandidates({
			dataBlockCandidates,
			dependentValueCandidates,
			explicitDataRowRanges,
			rows,
		});
		const structure = createStructuredContentStructure({
			blockSegments,
			columnCount: content.columnCount,
			dataBlockCandidates,
			numericRuns,
			rowCount: content.rowCount,
			semanticRulesFingerprint: semanticMatcher.fingerprint,
			titleSpans: columnTitleSpans,
		});
		const blocks = createStructuredMeasurementBlocks({
			columnProfiles,
			content,
			dataBlockCandidates,
			rows,
			semanticMatcher,
			titleSpans: columnTitleSpans,
			xGroupCandidates,
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
			infoCellNeighborhoods,
			bindingCandidates,
			semanticRulesFingerprint: semanticMatcher.fingerprint,
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

const createNumericRuns = (
	columnFacts: readonly StructuredContentColumnFacts[],
): readonly NumericRun[] => {
	const runs: NumericRun[] = [];
	for (const facts of columnFacts) {
		for (const run of facts.numericRuns) {
			if (run.pointCount < MinimumNumericRunPoints) {
				continue;
			}
			runs.push({
				id: `numeric-run:c${facts.column}:r${run.startRow}-${run.endRow}`,
				column: facts.column,
				startRow: run.startRow,
				endRow: run.endRow,
				values: run.values,
				coverage: run.pointCount / Math.max(1, run.endRow - run.startRow + 1),
				pointCount: run.pointCount,
			});
		}
	}
	return runs;
};

const createExplicitDataRowRanges = (
	rows: readonly (readonly string[])[],
	semanticMatcher: SemanticMatcher,
): readonly ExplicitDataRowRange[] => {
	const ranges: ExplicitDataRowRange[] = [];
	for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
		const titleMarker = semanticMatcher.matchRowMarkerInRow(rows[rowIndex] ?? []);
		if (titleMarker?.kind !== "titleRow") {
			continue;
		}
		const startRow = rowIndex + 1;
		let endRow = startRow - 1;
		for (let dataRow = startRow; dataRow < rows.length; dataRow += 1) {
			const dataMarker = semanticMatcher.matchRowMarkerInRow(rows[dataRow] ?? []);
			if (
				dataMarker?.kind !== "dataRow" ||
				(titleMarker.requiresSameMarkerColumn && dataMarker.column !== titleMarker.column)
			) {
				break;
			}
			endRow = dataRow;
		}
		if (endRow >= startRow) {
			ranges.push({
				markerColumn: titleMarker.column,
				titleRow: rowIndex,
				startRow,
				endRow,
			});
		}
	}
	return ranges;
};

const createColumnTitleSpanEvidence = ({
	numericRuns,
	rows,
	semanticMatcher,
}: {
	readonly numericRuns: readonly NumericRun[];
	readonly rows: readonly (readonly string[])[];
	readonly semanticMatcher: SemanticMatcher;
}): readonly StructuredColumnTitleSpanEvidence[] => {
	const spans: StructuredColumnTitleSpanEvidence[] = [];
	const titleCells = numericRuns
		.map((run): NumericRunTitleCell | null => {
			const titleCell = findTitleCellForNumericRun(rows, run, semanticMatcher);
			if (!titleCell) {
				return null;
			}
			return { run, titleCell };
		})
		.filter((candidate): candidate is NumericRunTitleCell => Boolean(candidate));
	const titleInterpretations = createRepeatedPairTitleInterpretations(titleCells, semanticMatcher);
	for (const { run, titleCell } of titleCells) {
		const interpretation = titleInterpretations.get(run.column);
		const titleText = interpretation?.semanticTitle ?? titleCell.text;

		const match = semanticMatcher.matchTitle(titleText);
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
			axisTendency: match.axisTendency,
			semanticRules: match.semanticRules,
			confidence: match.confidence,
			reasons: uniqueStrings([
				...match.reasons,
				...(interpretation?.reasons ?? []),
			]),
		});
	}
	return spans;
};

const createRepeatedPairTitleInterpretations = (
	titleCells: readonly NumericRunTitleCell[],
	semanticMatcher: SemanticMatcher,
): ReadonlyMap<number, RepeatedPairTitleInterpretation> => {
	const interpretations = new Map<number, RepeatedPairTitleInterpretation>();
	const groups = new Map<string, NumericRunTitleCell[]>();
	for (const item of titleCells) {
		const key = `${item.titleCell.row}:${item.run.startRow}:${item.run.endRow}`;
		const group = groups.get(key) ?? [];
		group.push(item);
		groups.set(key, group);
	}
	for (const group of groups.values()) {
		addRepeatedPairTitleInterpretations(interpretations, group, semanticMatcher);
	}
	return interpretations;
};

const addRepeatedPairTitleInterpretations = (
	interpretations: Map<number, RepeatedPairTitleInterpretation>,
	group: readonly NumericRunTitleCell[],
	semanticMatcher: SemanticMatcher,
): void => {
	const items = group.slice().sort((left, right) => left.run.column - right.run.column);
	const pairs: Array<{
		readonly base: string;
		readonly xColumn: number;
		readonly yColumn: number;
	}> = [];
	for (let index = 0; index < items.length - 1; index += 1) {
		const left = items[index];
		const right = items[index + 1];
		if (!left || !right || right.run.column !== left.run.column + 1) {
			continue;
		}
		const leftTitle = parsePairAxisTitle(left.titleCell.text);
		const rightTitle = parsePairAxisTitle(right.titleCell.text);
		if (!leftTitle || !rightTitle || leftTitle.axis !== "x" || rightTitle.axis !== "dependent") {
			continue;
		}
		if (semanticMatcher.toKey(leftTitle.base) !== semanticMatcher.toKey(rightTitle.base)) {
			continue;
		}
		pairs.push({
			base: leftTitle.base,
			xColumn: left.run.column,
			yColumn: right.run.column,
		});
	}
	if (pairs.length < 2) {
		return;
	}

	const parsedBases = pairs.map(pair => parseTrailingParenthesizedHeaderPart(pair.base));
	if (parsedBases.some(base => !base)) {
		return;
	}
	const semanticKey = semanticMatcher.toKey(parsedBases[0]?.outerText);
	if (!semanticKey || parsedBases.some(base => semanticMatcher.toKey(base?.outerText) !== semanticKey)) {
		return;
	}
	const innerKeys = new Set(parsedBases.map(base => semanticMatcher.toKey(base?.innerText)));
	if (innerKeys.size < 2) {
		return;
	}

	const semanticText = parsedBases[0]!.outerText;
	if (!semanticMatcher.matchTitle(`${semanticText} Y`)) {
		return;
	}

	const reasons = [
		"title.repeatedXYPair",
		"title.repeatedXYPair.commonSemantic",
		"title.repeatedXYPair.parenthesizedEvidence",
	];
	for (const pair of pairs) {
		interpretations.set(pair.xColumn, {
			semanticTitle: `${semanticText} X`,
			reasons,
		});
		interpretations.set(pair.yColumn, {
			semanticTitle: `${semanticText} Y`,
			reasons,
		});
	}
};

const parsePairAxisTitle = (
	value: string,
): { readonly axis: StructuredAxisTendency; readonly base: string } | null => {
	const normalized = normalizeText(value);
	const match = /(^|[\s_\-()])([xy])\s*$/i.exec(normalized);
	if (!match) {
		return null;
	}
	const axis = match[2]?.toLowerCase() === "x" ? "x" : "dependent";
	const base = normalized.slice(0, match.index).trim();
	return base ? { axis, base } : null;
};

const parseTrailingParenthesizedHeaderPart = (
	value: string | undefined,
): { readonly outerText: string; readonly innerText: string } | null => {
	const text = normalizeText(value);
	if (!text.endsWith(")")) {
		return null;
	}
	let depth = 0;
	for (let index = text.length - 1; index >= 0; index -= 1) {
		const char = text[index];
		if (char === ")") {
			depth += 1;
			continue;
		}
		if (char !== "(") {
			continue;
		}
		depth -= 1;
		if (depth !== 0) {
			continue;
		}
		const outerText = text.slice(0, index).trim();
		const innerText = text.slice(index + 1, -1).trim();
		return outerText && innerText ? { outerText, innerText } : null;
	}
	return null;
};

const findTitleCellForNumericRun = (
	rows: readonly (readonly string[])[],
	run: NumericRun,
	semanticMatcher: SemanticMatcher,
): StructuredColumnTitleSpanEvidence["titleCell"] | null => {
	const immediateRow = run.startRow - 1;
	if (immediateRow >= 0) {
		const immediate = readTitleCellFromRow(rows[immediateRow] ?? [], immediateRow, run.column, semanticMatcher);
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
		const titleCell = readTitleCellFromRow(row, rowIndex, run.column, semanticMatcher);
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
	semanticMatcher: SemanticMatcher,
): StructuredColumnTitleSpanEvidence["titleCell"] | null => {
	const rowMarker = semanticMatcher.matchRowMarkerInRow(row);
	const targetText = normalizeText(row[targetColumn]);
	if (rowMarker?.kind === "titleRow") {
		return targetText
			? {
				row: rowIndex,
				column: targetColumn,
				text: targetText,
			}
			: null;
	}
	if (rowMarker?.kind === "dataRow") {
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

const createInfoCellNeighborhoodEvidence = ({
	rows,
	semanticMatcher,
	titleSpans,
}: {
	readonly rows: readonly (readonly string[])[];
	readonly semanticMatcher: SemanticMatcher;
	readonly titleSpans: readonly StructuredColumnTitleSpanEvidence[];
}): readonly StructuredInfoCellNeighborhoodEvidence[] => {
	const neighborhoods: StructuredInfoCellNeighborhoodEvidence[] = [];
	for (const span of titleSpans) {
		const neighbors = readInfoCellNeighbors(rows, span.titleCell.row, span.titleCell.column);
		if (!neighbors.length) {
			continue;
		}
		const roleCandidates = createNeighborhoodRoleCandidates(span, neighbors, semanticMatcher);
		const intentCandidates = createNeighborhoodIntentCandidates(span, neighbors, roleCandidates);
		const reasons = createNeighborhoodReasons(neighbors, roleCandidates, intentCandidates, semanticMatcher);
		const confidence = clampConfidence(
			0.18 +
			(roleCandidates[0]?.confidence ?? 0) * 0.42 +
			(intentCandidates[0]?.confidence ?? 0) * 0.28 +
			Math.min(0.12, neighbors.length * 0.03),
		);
		neighborhoods.push({
			id: `info-neighborhood:c${span.targetColumn}:r${span.titleCell.row}`,
			infoCell: span.titleCell,
			targetColumn: span.targetColumn,
			startRow: span.startRow,
			endRow: span.endRow,
			neighbors,
			xRoleCandidates: roleCandidates,
			intentCandidates,
			confidence,
			reasons,
		});
	}
	return neighborhoods;
};

const applyInfoCellNeighborhoodEvidenceToTitleSpans = ({
	neighborhoods,
	titleSpans,
}: {
	readonly neighborhoods: readonly StructuredInfoCellNeighborhoodEvidence[];
	readonly titleSpans: readonly StructuredColumnTitleSpanEvidence[];
}): readonly StructuredColumnTitleSpanEvidence[] => {
	const neighborhoodsBySpan = new Map<string, StructuredInfoCellNeighborhoodEvidence>();
	for (const neighborhood of neighborhoods) {
		neighborhoodsBySpan.set(
			`${neighborhood.targetColumn}:${neighborhood.startRow}:${neighborhood.endRow}:${neighborhood.infoCell.row}`,
			neighborhood,
		);
	}

	return titleSpans.map(span => {
		const neighborhood = neighborhoodsBySpan.get(`${span.targetColumn}:${span.startRow}:${span.endRow}:${span.titleCell.row}`);
		if (!neighborhood) {
			return span;
		}
		const roleBoost = span.axisTendency === "x"
			? (neighborhood.xRoleCandidates[0]?.confidence ?? 0) * 0.04
			: 0;
		const intentBoost = (neighborhood.intentCandidates[0]?.confidence ?? 0) * 0.03;
		return {
			...span,
			confidence: clampConfidence(span.confidence + roleBoost + intentBoost),
			reasons: uniqueStrings([
				...span.reasons,
				...neighborhood.reasons,
			]),
		};
	});
};

const readInfoCellNeighbors = (
	rows: readonly (readonly string[])[],
	row: number,
	column: number,
): StructuredInfoCellNeighborhoodEvidence["neighbors"] => {
	const neighbors: StructuredInfoCellNeighborhoodEvidence["neighbors"][number][] = [];
	const offsets: Array<{
		readonly direction: StructuredInfoCellNeighborhoodEvidence["neighbors"][number]["direction"];
		readonly rowOffset: number;
		readonly columnOffset: number;
	}> = [
		{ direction: "up", rowOffset: -1, columnOffset: 0 },
		{ direction: "down", rowOffset: 1, columnOffset: 0 },
		{ direction: "left", rowOffset: 0, columnOffset: -1 },
		{ direction: "right", rowOffset: 0, columnOffset: 1 },
	];
	for (const offset of offsets) {
		const neighborRow = row + offset.rowOffset;
		const neighborColumn = column + offset.columnOffset;
		if (neighborRow < 0 || neighborColumn < 0) {
			continue;
		}
		const value = normalizeText(rows[neighborRow]?.[neighborColumn]);
		if (!value) {
			continue;
		}
		neighbors.push({
			direction: offset.direction,
			row: neighborRow,
			column: neighborColumn,
			text: value,
		});
	}
	return neighbors;
};

const createNeighborhoodRoleCandidates = (
	span: StructuredColumnTitleSpanEvidence,
	neighbors: StructuredInfoCellNeighborhoodEvidence["neighbors"],
	semanticMatcher: SemanticMatcher,
): StructuredInfoCellNeighborhoodEvidence["xRoleCandidates"] => {
	const candidates = new Map<StructuredXAxisRole, { confidence: number; reasons: string[] }>();
	const addCandidate = (
		role: StructuredXAxisRole,
		confidence: number,
		reason: string,
	): void => {
		if (role === "unknown") {
			return;
		}
		const current = candidates.get(role);
		if (!current) {
			candidates.set(role, { confidence, reasons: [reason] });
			return;
		}
		current.confidence = Math.max(current.confidence, confidence);
		current.reasons.push(reason);
	};

	addCandidate(
		toXAxisRole(span.canonicalRole),
		span.axisTendency === "x" ? 0.88 : 0.42,
		`infoNeighborhood.titleRole:${span.canonicalRole}`,
	);

	for (const neighbor of neighbors) {
		const match = semanticMatcher.matchTitle(neighbor.text);
		if (match) {
			addCandidate(
				toXAxisRole(match.canonicalRole),
				match.axisTendency === "x" ? 0.82 : 0.46,
				`infoNeighborhood.neighborRole:${neighbor.direction}:${match.canonicalRole}`,
			);
		}
		for (const role of readTextRoleSignals(neighbor.text)) {
			addCandidate(role, 0.72, `infoNeighborhood.textRole:${neighbor.direction}:${role}`);
		}
	}

	return Array.from(candidates, ([role, value]) => ({
		role,
		confidence: clampConfidence(value.confidence),
		reasons: uniqueStrings(value.reasons),
	})).sort((left, right) => right.confidence - left.confidence);
};

const createNeighborhoodIntentCandidates = (
	span: StructuredColumnTitleSpanEvidence,
	neighbors: StructuredInfoCellNeighborhoodEvidence["neighbors"],
	roleCandidates: StructuredInfoCellNeighborhoodEvidence["xRoleCandidates"],
): StructuredInfoCellNeighborhoodEvidence["intentCandidates"] => {
	const context = [
		span.titleCell.text,
		...neighbors.map(neighbor => neighbor.text),
	].join(" ");
	const normalized = normalizeNeighborhoodText(context);
	const primaryRole = toXAxisRole(span.canonicalRole);
	const roles = new Set(roleCandidates.map(candidate => candidate.role));
	const candidates = new Map<StructuredXAxisIntent, { confidence: number; reasons: string[] }>();
	const addCandidate = (
		intent: StructuredXAxisIntent,
		confidence: number,
		reason: string,
	): void => {
		const current = candidates.get(intent);
		if (!current) {
			candidates.set(intent, { confidence, reasons: [reason] });
			return;
		}
		current.confidence = Math.max(current.confidence, confidence);
		current.reasons.push(reason);
	};

	if (/(^|[^a-z0-9])(pv|p-v|polar|polarization|wake|vp|vpn)([^a-z0-9]|$)|dc\s*=/.test(normalized)) {
		addCandidate("pvCurve", primaryRole === "voltage" ? 0.86 : roles.has("voltage") ? 0.62 : 0.5, "infoNeighborhood.intent:pvCurve");
	}
	if (/(^|[^a-z0-9])(fastiv|ivt|transient|waveform|interval|point|time)([^a-z0-9]|$)/.test(normalized)) {
		addCandidate("rawTransient", primaryRole === "time" ? 0.88 : roles.has("time") ? 0.62 : 0.5, "infoNeighborhood.intent:rawTransient");
	}
	if (/(^|[^a-z0-9])(cv|c-v|cap|capacitance|cp|cgg)([^a-z0-9]|$)/.test(normalized)) {
		addCandidate("cvCurve", 0.78, "infoNeighborhood.intent:cvCurve");
	}
	if (/(^|[^a-z0-9])(cf|c-f|freq|frequency)([^a-z0-9]|$)/.test(normalized)) {
		addCandidate("frequencySweep", primaryRole === "frequency" ? 0.86 : roles.has("frequency") ? 0.68 : 0.56, "infoNeighborhood.intent:frequencySweep");
	}
	if (/(^|[^a-z0-9])(iv|i-v|idvg|idvd|vg|vd)([^a-z0-9]|$)/.test(normalized)) {
		addCandidate("ivCurve", primaryRole === "voltage" ? 0.82 : roles.has("voltage") ? 0.62 : 0.5, "infoNeighborhood.intent:ivCurve");
	}

	return Array.from(candidates, ([intent, value]) => ({
		intent,
		confidence: clampConfidence(value.confidence),
		reasons: uniqueStrings(value.reasons),
	})).sort((left, right) => right.confidence - left.confidence);
};

const createNeighborhoodReasons = (
	neighbors: StructuredInfoCellNeighborhoodEvidence["neighbors"],
	roleCandidates: StructuredInfoCellNeighborhoodEvidence["xRoleCandidates"],
	intentCandidates: StructuredInfoCellNeighborhoodEvidence["intentCandidates"],
	semanticMatcher: SemanticMatcher,
): readonly string[] => {
	const reasons = neighbors.map(neighbor => `infoNeighborhood.neighbor:${neighbor.direction}`);
	for (const neighbor of neighbors) {
		const match = semanticMatcher.matchTitle(neighbor.text);
		if (match) {
			reasons.push(`infoNeighborhood.semantic:${neighbor.direction}:${match.canonicalRole}:${match.axisTendency}`);
		}
	}
	if (roleCandidates[0]) {
		reasons.push(`infoNeighborhood.xRole:${roleCandidates[0].role}`);
	}
	if (intentCandidates[0]) {
		reasons.push(`infoNeighborhood.intent:${intentCandidates[0].intent}`);
	}
	return uniqueStrings(reasons);
};

const toXAxisRole = (
	role: StructuredColumnTitleSpanEvidence["canonicalRole"],
): StructuredXAxisRole => {
	if (role === "time") {
		return "time";
	}
	if (role === "frequency") {
		return "frequency";
	}
	if (role === "current" || role === "id" || role === "ig" || role === "is") {
		return "current";
	}
	if (role === "voltage" || role === "vd" || role === "vg" || role === "vs") {
		return "voltage";
	}
	return "unknown";
};

const readTextRoleSignals = (
	value: string,
): readonly StructuredXAxisRole[] => {
	const normalized = normalizeNeighborhoodText(value);
	const roles: StructuredXAxisRole[] = [];
	if (/(^|[^a-z0-9])(time|timestamp|interval|sec|second|ms)([^a-z0-9]|$)/.test(normalized)) {
		roles.push("time");
	}
	if (/(^|[^a-z0-9])(v|vg|vd|vp|vpn|voltage|bias)([^a-z0-9]|$)|dc\s*=/.test(normalized)) {
		roles.push("voltage");
	}
	if (/(^|[^a-z0-9])(i|id|ig|current)([^a-z0-9]|$)/.test(normalized)) {
		roles.push("current");
	}
	if (/(^|[^a-z0-9])(freq|frequency|hz|khz|mhz)([^a-z0-9]|$)/.test(normalized)) {
		roles.push("frequency");
	}
	if (/(^|[^a-z0-9])(temp|temperature|degc|celsius)([^a-z0-9]|$)/.test(normalized)) {
		roles.push("temperature");
	}
	if (/(^|[^a-z0-9])(position|distance|xpos|ypos)([^a-z0-9]|$)/.test(normalized)) {
		roles.push("position");
	}
	if (/(^|[^a-z0-9])(index|step|point|sample)([^a-z0-9]|$)/.test(normalized)) {
		roles.push("index");
	}
	return uniqueStrings(roles);
};

const normalizeNeighborhoodText = (
	value: string,
): string => value
	.toLowerCase()
	.replace(/\u00b5|\u03bc/g, "u")
	.replace(/\u03a9|\u03c9|\u2126/g, "ohm");

const createColumnProfiles = ({
	columnCount,
	columnKinds,
	numericRuns,
	semanticMatcher,
	titleSpans,
}: {
	readonly columnCount: number;
	readonly columnKinds: readonly StructuredColumnProfile["kind"][];
	readonly numericRuns: readonly NumericRun[];
	readonly semanticMatcher: SemanticMatcher;
	readonly titleSpans: readonly StructuredColumnTitleSpanEvidence[];
}): readonly StructuredColumnProfile[] => {
	const longestRunsByColumn = createLongestRunsByColumn(numericRuns);
	const titleSpansByColumn = createBestTitleSpanByColumn(titleSpans);
	return Array.from({ length: columnCount }, (_, column): StructuredColumnProfile => {
		const titleSpan = titleSpansByColumn.get(column);
		const headerText = titleSpan?.titleCell.text ?? getFallbackColumnHeaderText(column);
		const normalizedHeader = titleSpan?.normalizedTitle ?? semanticMatcher.toKey(headerText);
		const numericRun = longestRunsByColumn.get(column);
		const explicitUnitText = titleSpan?.canonicalUnit ?? null;
		return {
			rawCol: column,
			headerText,
			normalizedHeader,
			explicitUnitText,
			kind: columnKinds[column] ?? "empty",
			...(numericRun ? { numericStats: createColumnNumericStats(numericRun) } : {}),
		};
	});
};

const createColumnSemanticCandidates = ({
	columnProfiles,
	semanticMatcher,
	titleSpans,
}: {
	readonly columnProfiles: readonly StructuredColumnProfile[];
	readonly semanticMatcher: SemanticMatcher;
	readonly titleSpans: readonly StructuredColumnTitleSpanEvidence[];
}): readonly StructuredColumnSemanticCandidate[] => {
	const titleSpansByColumn = createBestTitleSpanByColumn(titleSpans);
	return columnProfiles.map(profile => {
		const titleSpan = titleSpansByColumn.get(profile.rawCol);
		const match = titleSpan
			? null
			: semanticMatcher.matchTitle(profile.headerText);
		const role = titleSpan?.canonicalRole ?? match?.canonicalRole ?? "unknown";
		const unit = titleSpan?.canonicalUnit;
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
	const drafts: XRangeDraft[] = [];
	for (const run of numericRuns) {
		const titleSpan = titleSpansByRun.get(getRunKey(run));
		const pattern = analyzeNumericPattern(run.values);
		const baseConfidence = scoreXRangeCandidate({
			columnCount,
			pattern,
			rows,
			run,
			titleSpan,
		});
		if (baseConfidence < 0.45) {
			continue;
		}

		drafts.push({
			baseConfidence,
			pattern,
			run,
			...(titleSpan ? { titleSpan } : {}),
		});
	}

	const analyses: XRangeAnalysis[] = [];
	for (const draft of drafts) {
		const confidence = clampConfidence(draft.baseConfidence);
		if (confidence < 0.45) {
			continue;
		}

		const reasons = createXRangeReasons(draft.pattern, draft.titleSpan, rows, draft.run);
		analyses.push({
			run: draft.run,
			candidate: {
				id: `x-range:c${draft.run.column}:r${draft.run.startRow}-${draft.run.endRow}`,
				column: draft.run.column,
				startRow: draft.run.startRow,
				endRow: draft.run.endRow,
				direction: draft.pattern.direction,
				stepKind: draft.pattern.stepKind,
				...(draft.pattern.step !== undefined ? { step: draft.pattern.step } : {}),
				pointCount: draft.run.pointCount,
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
	blockSegments,
	columnCount,
	explicitDataRowRanges,
	rows,
	titleSpans,
	xGroupCandidates,
	xRangeAnalyses,
}: {
	readonly blockSegments: readonly StructuredBlockSegment[];
	readonly columnCount: number;
	readonly explicitDataRowRanges: readonly ExplicitDataRowRange[];
	readonly rows: readonly (readonly string[])[];
	readonly titleSpans: readonly StructuredColumnTitleSpanEvidence[];
	readonly xGroupCandidates: readonly StructuredXGroupCandidate[];
	readonly xRangeAnalyses: readonly XRangeAnalysis[];
}): readonly StructuredDataBlockCandidate[] => {
	const titleSpansByColumn = createBestTitleSpanByColumn(titleSpans);
	const groupsByXRangeId = groupXGroupsByRangeId(xGroupCandidates);
	const strongX = xRangeAnalyses.filter(analysis => analysis.candidate.confidence >= BlockXConfidenceThreshold);
	const blocks: StructuredDataBlockCandidate[] = [];
	const blockScopes = blockSegments.length && explicitDataRowRanges.length < 2
		? blockSegments.map(segment => segment.dataRange)
		: [{
			startRow: 0,
			endRow: Math.max(0, rows.length - 1),
			startCol: 0,
			endCol: Math.max(0, columnCount - 1),
		}];
	for (const scope of blockScopes) {
		const scopedX = selectBlockScopedXRangeAnalyses({
			scope,
			strongX,
			titleSpansByColumn,
		});
		for (const analysis of scopedX) {
			const right = scanDependentColumns({
				analysis,
				direction: "right",
				maxColumn: scope.endCol,
				minColumn: scope.startCol,
				rows,
				titleSpansByColumn,
				xRangeAnalyses: scopedX,
			});
			const left = right.dependentColumns.length
				? emptyDependentScan
				: scanDependentColumns({
					analysis,
					direction: "left",
					maxColumn: scope.endCol,
					minColumn: scope.startCol,
					rows,
					titleSpansByColumn,
					xRangeAnalyses: scopedX,
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
	}
	const sharedXBlocks = createRepeatedPairSharedXDataBlocks(blocks, rows);
	return [...blocks, ...sharedXBlocks].sort((left, right) =>
		left.startCol - right.startCol ||
		left.startRow - right.startRow
	);
};

const selectBlockScopedXRangeAnalyses = ({
	scope,
	strongX,
	titleSpansByColumn,
}: {
	readonly scope: StructuredContentSourceRange;
	readonly strongX: readonly XRangeAnalysis[];
	readonly titleSpansByColumn: ReadonlyMap<number, StructuredColumnTitleSpanEvidence>;
}): readonly XRangeAnalysis[] => {
	const scoped = strongX.filter(analysis =>
		analysis.candidate.column >= scope.startCol &&
		analysis.candidate.column <= scope.endCol &&
		analysis.candidate.startRow >= scope.startRow &&
		analysis.candidate.endRow <= scope.endRow
	);
	const preferred = scoped.filter(analysis => isPreferredBlockXRange(analysis, titleSpansByColumn));
	return preferred.length ? preferred : scoped;
};

const isPreferredBlockXRange = (
	analysis: XRangeAnalysis,
	titleSpansByColumn: ReadonlyMap<number, StructuredColumnTitleSpanEvidence>,
): boolean => {
	const titleSpan = titleSpansByColumn.get(analysis.candidate.column);
	return titleSpan?.axisTendency === "x" && !isIndexLikeHeader(titleSpan.titleCell.text);
};

const isIndexLikeHeader = (
	value: string,
): boolean => /^(index|idx|point|points|sample|samples|step|steps)$/i.test(normalizeText(value));

const applyExplicitDataRowBoundaryEvidence = ({
	blocks,
	explicitDataRowRanges,
}: {
	readonly blocks: readonly StructuredDataBlockCandidate[];
	readonly explicitDataRowRanges: readonly ExplicitDataRowRange[];
}): readonly StructuredDataBlockCandidate[] => {
	if (!explicitDataRowRanges.length) {
		return blocks;
	}
	const containedBlocks = blocks.filter(block =>
		explicitDataRowRanges.some(range => isDataBlockInsideExplicitDataRows(block, range))
	);
	if (!containedBlocks.length) {
		return blocks;
	}
	return containedBlocks.map(block => ({
		...block,
		confidence: clampConfidence(block.confidence + 0.04),
		reasons: uniqueStrings([...block.reasons, "dataBlock.explicitDataRows"]),
	}));
};

const isDataBlockInsideExplicitDataRows = (
	block: StructuredDataBlockCandidate,
	range: ExplicitDataRowRange,
): boolean =>
	block.startRow >= range.startRow &&
	block.endRow <= range.endRow;

const createRepeatedPairSharedXDataBlocks = (
	blocks: readonly StructuredDataBlockCandidate[],
	rows: readonly (readonly string[])[],
): readonly StructuredDataBlockCandidate[] => {
	const pairwiseBlocks = blocks
		.filter(block =>
			block.columnDirection === "rightPreferred" &&
			block.dependentColumns.length === 1 &&
			block.endCol === block.xColumn + 1
		)
		.sort((left, right) =>
			left.startRow - right.startRow ||
			left.endRow - right.endRow ||
			left.startCol - right.startCol
		);
	const sharedBlocks: StructuredDataBlockCandidate[] = [];
	let index = 0;
	while (index < pairwiseBlocks.length) {
		const first = pairwiseBlocks[index];
		if (!first) {
			break;
		}
		const group = [first];
		index += 1;
		while (index < pairwiseBlocks.length) {
			const next = pairwiseBlocks[index];
			const previous = group[group.length - 1];
			if (
				!next ||
				!previous ||
				next.startRow !== first.startRow ||
				next.endRow !== first.endRow ||
				next.startCol !== previous.endCol + 1 ||
				!haveSameNumericValues(rows, first.xColumn, next.xColumn, first.startRow, first.endRow)
			) {
				break;
			}
			group.push(next);
			index += 1;
		}
		if (group.length < 2) {
			continue;
		}
		const dependentColumns = group.map(block => block.dependentColumns[0]).filter((column): column is number => Number.isInteger(column));
		const last = group[group.length - 1]!;
		sharedBlocks.push({
			id: `data-block:shared-x:c${first.xColumn}-${last.endCol}:r${first.startRow}-${first.endRow}`,
			xRangeCandidateId: first.xRangeCandidateId,
			xGroupCandidateIds: first.xGroupCandidateIds,
			startRow: first.startRow,
			endRow: first.endRow,
			startCol: first.startCol,
			endCol: last.endCol,
			xColumn: first.xColumn,
			dependentColumns,
			separatorColumns: [],
			columnDirection: "rightPreferred",
			confidence: clampConfidence(Math.min(...group.map(block => block.confidence)) + 0.08),
			reasons: [
				"dataBlock.repeatedPairSharedX",
				"dataBlock.sharedIdenticalXValues",
				"dataBlock.columnDirection:rightPreferred",
			],
		});
	}
	return sharedBlocks;
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
	direction,
	maxColumn,
	minColumn,
	rows,
	titleSpansByColumn,
	xRangeAnalyses,
}: {
	readonly analysis: XRangeAnalysis;
	readonly direction: "left" | "right";
	readonly maxColumn: number;
	readonly minColumn: number;
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
		column >= minColumn && column <= maxColumn;
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
			const xTitleSpan = titleSpansByColumn.get(analysis.candidate.column);
			const dependentTitleSpan = titleSpansByColumn.get(column);
			if (
				xTitleSpan &&
				!hasSharedRuleBinding(xTitleSpan, dependentTitleSpan) &&
				(dependentTitleSpan || !isAlignedHeaderDependentColumn({ analysis, column, rows }))
			) {
				continue;
			}
			dependentColumns.push(column);
			continue;
		}
		if (hasTextInRange(rows, column, analysis.candidate.startRow, analysis.candidate.endRow)) {
			break;
		}
	}
	const boundaryColumn = direction === "right" ? maxColumn + 1 : minColumn - 1;
	if (
		boundaryColumn >= 0 &&
		hasColumn(rows, boundaryColumn) &&
		isSeparatorColumn(rows, boundaryColumn, analysis.candidate.startRow, analysis.candidate.endRow)
	) {
		separatorColumns.push(boundaryColumn);
	}
	return { dependentColumns, separatorColumns };
};

const hasColumn = (
	rows: readonly (readonly string[])[],
	column: number,
): boolean => rows.some(row => column < row.length);

const hasSharedRuleBinding = (
	xTitleSpan: StructuredColumnTitleSpanEvidence,
	dependentTitleSpan: StructuredColumnTitleSpanEvidence | undefined,
): boolean => {
	const xRuleIds = new Set(xTitleSpan.semanticRules
		.filter(rule => rule.axisTendency === "x")
		.map(rule => rule.id));
	if (!xRuleIds.size) {
		return true;
	}
	return Boolean(dependentTitleSpan?.semanticRules.some(rule =>
		rule.axisTendency === "dependent" &&
		xRuleIds.has(rule.id)
	));
};

const isAlignedHeaderDependentColumn = ({
	analysis,
	column,
	rows,
}: {
	readonly analysis: XRangeAnalysis;
	readonly column: number;
	readonly rows: readonly (readonly string[])[];
}): boolean => {
	const headerRow = analysis.candidate.startRow - 1;
	if (headerRow < 0) {
		return false;
	}
	const xHeader = getHeaderCellText(rows, headerRow, analysis.candidate.column);
	const dependentHeader = getHeaderCellText(rows, headerRow, column);
	return Boolean(
		xHeader &&
		parseFiniteNumber(xHeader) === null &&
		dependentHeader &&
		parseFiniteNumber(dependentHeader) !== null
	);
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
	explicitDataRowRanges,
	rows,
}: {
	readonly dataBlockCandidates: readonly StructuredDataBlockCandidate[];
	readonly dependentValueCandidates: readonly StructuredDependentValueCandidate[];
	readonly explicitDataRowRanges: readonly ExplicitDataRowRange[];
	readonly rows: readonly (readonly string[])[];
}): readonly StructuredBindingCandidate[] => {
	const dependentByBlockId = new Map<string, StructuredDependentValueCandidate[]>();
	for (const dependent of dependentValueCandidates) {
		for (const blockId of dependent.dataBlockCandidateIds) {
			const list = dependentByBlockId.get(blockId) ?? [];
			list.push(dependent);
			dependentByBlockId.set(blockId, list);
		}
	}

	const coveredPairBlockIds = createSharedXCoveredPairBlockIds(dataBlockCandidates);
	const coveredLegendBlockIds = createAlignedHeaderCoveredBlockIds(dataBlockCandidates, rows);
	const coveredBlockIds = new Set([
		...coveredPairBlockIds,
		...coveredLegendBlockIds,
	]);
	const candidates: StructuredBindingCandidate[] = [];
	for (const block of dataBlockCandidates) {
		if (coveredBlockIds.has(block.id)) {
			continue;
		}
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
		block.columnDirection === "rightPreferred" &&
		!coveredBlockIds.has(block.id)
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

	const repeatedBlocks = dataBlockCandidates.filter(block =>
		block.columnDirection === "rightPreferred" &&
		block.dependentColumns.length > 1 &&
		!coveredBlockIds.has(block.id)
	);
	if (repeatedBlocks.length > 1 && haveAlignedRepeatedBlocks(repeatedBlocks)) {
		const blockIds = repeatedBlocks.map(block => block.id);
		candidates.push({
			id: "binding:repeated-blocks",
			xRangeCandidateIds: repeatedBlocks.map(block => block.xRangeCandidateId),
			dependentValueCandidateIds: repeatedBlocks.flatMap(block =>
				dependentByBlockId.get(block.id)?.map(candidate => candidate.id) ?? []
			),
			dataBlockCandidateIds: blockIds,
			relation: "repeatedBlocks",
			confidence: clampConfidence(Math.min(...repeatedBlocks.map(block => block.confidence)) + 0.06),
			ambiguityCodes: [],
			reasons: ["binding.repeatedBlocks"],
		});
	}

	const verticalRepeatedBlockGroups = createVerticalRepeatedBlockGroups({
		blocks: dataBlockCandidates,
		coveredBlockIds,
		explicitDataRowRanges,
		rows,
	});
	for (const group of verticalRepeatedBlockGroups) {
		const blockIds = group.map(block => block.id);
		candidates.push({
			id: `binding:vertical-repeated-blocks:${getVerticalRepeatedBlockBindingKey(group)}`,
			xRangeCandidateIds: group.map(block => block.xRangeCandidateId),
			dependentValueCandidateIds: group.flatMap(block =>
				dependentByBlockId.get(block.id)?.map(candidate => candidate.id) ?? []
			),
			dataBlockCandidateIds: blockIds,
			relation: "repeatedBlocks",
			confidence: clampConfidence(Math.min(...group.map(block => block.confidence)) + 0.06),
			ambiguityCodes: [],
			reasons: ["binding.repeatedBlocks", "binding.repeatedBlocks.explicitDataRows"],
		});
	}

	return candidates.sort((left, right) =>
		right.confidence - left.confidence ||
		right.dataBlockCandidateIds.length - left.dataBlockCandidateIds.length ||
		left.id.localeCompare(right.id)
	);
};

const createSharedXCoveredPairBlockIds = (
	blocks: readonly StructuredDataBlockCandidate[],
): ReadonlySet<string> => {
	const sharedBlocks = blocks.filter(block => block.reasons.includes("dataBlock.repeatedPairSharedX"));
	if (!sharedBlocks.length) {
		return new Set();
	}
	const coveredIds = new Set<string>();
	for (const block of blocks) {
		if (
			block.dependentColumns.length !== 1 ||
			block.columnDirection !== "rightPreferred" ||
			block.reasons.includes("dataBlock.repeatedPairSharedX")
		) {
			continue;
		}
		if (sharedBlocks.some(sharedBlock => isPairBlockCoveredBySharedXBlock(block, sharedBlock))) {
			coveredIds.add(block.id);
		}
	}
	return coveredIds;
};

const isPairBlockCoveredBySharedXBlock = (
	block: StructuredDataBlockCandidate,
	sharedBlock: StructuredDataBlockCandidate,
): boolean =>
	block.startRow === sharedBlock.startRow &&
	block.endRow === sharedBlock.endRow &&
	block.startCol >= sharedBlock.startCol &&
	block.endCol <= sharedBlock.endCol &&
	sharedBlock.dependentColumns.includes(block.dependentColumns[0] ?? -1);

const createAlignedHeaderCoveredBlockIds = (
	blocks: readonly StructuredDataBlockCandidate[],
	rows: readonly (readonly string[])[],
): ReadonlySet<string> => {
	const sharedBlocks = blocks.filter(block =>
		block.columnDirection === "rightPreferred" &&
		block.dependentColumns.length > 1 &&
		findAlignedBlockHeaderRow({ block, rows }) !== undefined
	);
	if (!sharedBlocks.length) {
		return new Set();
	}
	const coveredIds = new Set<string>();
	for (const block of blocks) {
		if (sharedBlocks.some(sharedBlock => isBlockCoveredByAlignedHeaderSharedXBlock(block, sharedBlock))) {
			coveredIds.add(block.id);
		}
	}
	return coveredIds;
};

const isBlockCoveredByAlignedHeaderSharedXBlock = (
	block: StructuredDataBlockCandidate,
	sharedBlock: StructuredDataBlockCandidate,
): boolean =>
	block.id !== sharedBlock.id &&
	sharedBlock.dependentColumns.includes(block.xColumn) &&
	block.startRow === sharedBlock.startRow - 1 &&
	block.endRow === sharedBlock.endRow &&
	block.startCol >= sharedBlock.startCol &&
	block.endCol <= sharedBlock.endCol;

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

const haveAlignedRepeatedBlocks = (
	blocks: readonly StructuredDataBlockCandidate[],
): boolean => {
	const first = blocks[0];
	return Boolean(first) && blocks.every(block =>
		block.startRow === first.startRow &&
		block.endRow === first.endRow &&
		block.dependentColumns.length === first.dependentColumns.length &&
		block.dependentColumns.length > 0
	);
};

const createVerticalRepeatedBlockGroups = ({
	blocks,
	coveredBlockIds,
	explicitDataRowRanges,
	rows,
}: {
	readonly blocks: readonly StructuredDataBlockCandidate[];
	readonly coveredBlockIds: ReadonlySet<string>;
	readonly explicitDataRowRanges: readonly ExplicitDataRowRange[];
	readonly rows: readonly (readonly string[])[];
}): readonly (readonly StructuredDataBlockCandidate[])[] => {
	if (explicitDataRowRanges.length < 2) {
		return [];
	}
	const groups = new Map<string, StructuredDataBlockCandidate[]>();
	for (const block of blocks) {
		if (
			coveredBlockIds.has(block.id) ||
			block.columnDirection !== "rightPreferred" ||
			!block.dependentColumns.length
		) {
			continue;
		}
		const range = findContainingExplicitDataRowRange(block, explicitDataRowRanges);
		if (!range || block.startRow !== range.startRow || block.endRow !== range.endRow) {
			continue;
		}
		const schemaKey = createVerticalRepeatedBlockSchemaKey(block, range, rows);
		if (!schemaKey) {
			continue;
		}
		const group = groups.get(schemaKey) ?? [];
		group.push(block);
		groups.set(schemaKey, group);
	}
	return Array.from(groups.values())
		.filter(group => group.length > 1)
		.map(group => group.sort((left, right) => left.startRow - right.startRow || left.startCol - right.startCol))
		.sort((left, right) => (left[0]?.startCol ?? 0) - (right[0]?.startCol ?? 0));
};

const findContainingExplicitDataRowRange = (
	block: StructuredDataBlockCandidate,
	ranges: readonly ExplicitDataRowRange[],
): ExplicitDataRowRange | undefined =>
	ranges.find(range =>
		block.startRow >= range.startRow &&
		block.endRow <= range.endRow
	);

const createVerticalRepeatedBlockSchemaKey = (
	block: StructuredDataBlockCandidate,
	range: ExplicitDataRowRange,
	rows: readonly (readonly string[])[],
): string | null => {
	const columns = [block.xColumn, ...block.dependentColumns];
	const headerKeys = columns.map(column => normalizeHeaderLegendText(getHeaderCellText(rows, range.titleRow, column)));
	if (headerKeys.some(header => !header)) {
		return null;
	}
	return [
		`x:${block.xColumn - block.startCol}`,
		`y:${block.dependentColumns.map(column => column - block.startCol).join(",")}`,
		`headers:${headerKeys.join(",")}`,
	].join("|");
};

const getVerticalRepeatedBlockBindingKey = (
	group: readonly StructuredDataBlockCandidate[],
): string => {
	const first = group[0]!;
	const last = group[group.length - 1]!;
	return `c${first.startCol}-${first.endCol}:r${first.startRow}-${last.endRow}`;
};

const createStructuredContentStructure = ({
	blockSegments,
	columnCount,
	dataBlockCandidates,
	numericRuns,
	rowCount,
	semanticRulesFingerprint,
	titleSpans,
}: {
	readonly blockSegments: readonly StructuredBlockSegment[];
	readonly columnCount: number;
	readonly dataBlockCandidates: readonly StructuredDataBlockCandidate[];
	readonly numericRuns: readonly NumericRun[];
	readonly rowCount: number;
	readonly semanticRulesFingerprint: string;
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
	const dataRegions = dataBlockCandidates.map(block => ({
		id: `data-region:${block.id}`,
		range: {
			startRow: block.startRow,
			endRow: block.endRow,
			startCol: block.startCol,
			endCol: block.endCol,
		},
		rowCount: block.endRow - block.startRow + 1,
		columnCount: block.endCol - block.startCol + 1,
	}));
	const blockRegions = blockSegments.map(segment => ({
		id: `block-region:${segment.id}`,
		range: segment.range,
		kind: "single" as const,
	}));
	return {
		headerRows,
		unitRows: [],
		dataRegions,
		blockRegions,
		fingerprint: createStructureFingerprint({
			columnCount,
			dataBlockCandidates,
			blockSegments,
			rowCount,
			semanticRulesFingerprint,
			titleSpans,
		}),
	};
};

const createStructureFingerprint = ({
	columnCount,
	dataBlockCandidates,
	blockSegments,
	rowCount,
	semanticRulesFingerprint,
	titleSpans,
}: {
	readonly columnCount: number;
	readonly dataBlockCandidates: readonly StructuredDataBlockCandidate[];
	readonly blockSegments: readonly StructuredBlockSegment[];
	readonly rowCount: number;
	readonly semanticRulesFingerprint: string;
	readonly titleSpans: readonly StructuredColumnTitleSpanEvidence[];
}): string => [
	"data-resource-structure",
	rowCount,
	columnCount,
	semanticRulesFingerprint,
	dataBlockCandidates.map(block => [
		block.startRow,
		block.endRow,
		block.startCol,
		block.endCol,
		block.xColumn,
		block.dependentColumns.join(","),
	].join(":")).join("|"),
	blockSegments.map(segment => [
		segment.range.startRow,
		segment.range.endRow,
		segment.range.startCol,
		segment.range.endCol,
		segment.dataRange.startRow,
		segment.dataRange.endRow,
		segment.dataRange.startCol,
		segment.dataRange.endCol,
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
	rows,
	semanticMatcher,
	titleSpans,
	xGroupCandidates,
}: {
	readonly columnProfiles: readonly StructuredColumnProfile[];
	readonly content: TableModelContentSnapshot;
	readonly dataBlockCandidates: readonly StructuredDataBlockCandidate[];
	readonly rows: readonly (readonly string[])[];
	readonly semanticMatcher: SemanticMatcher;
	readonly titleSpans: readonly StructuredColumnTitleSpanEvidence[];
	readonly xGroupCandidates: readonly StructuredXGroupCandidate[];
}): readonly StructuredMeasurementBlockRecord[] => {
	const titleSpansByColumn = createBestTitleSpanByColumn(titleSpans);
	return dataBlockCandidates.map((block): StructuredMeasurementBlockRecord => {
		const measurement = inferMeasurementForBlock(block, {
			rows,
			semanticMatcher,
			titleSpansByColumn,
			xGroupCandidates,
		});
		const alignedHeaderRow = findAlignedBlockHeaderRow({ block, rows });
		const headerRows = block.dependentColumns
			.map(column => titleSpansByColumn.get(column)?.titleCell.row)
			.concat(titleSpansByColumn.get(block.xColumn)?.titleCell.row)
			.filter((row): row is number => Number.isInteger(row));
		const titleRow = headerRows.length ? Math.min(...headerRows) : alignedHeaderRow;
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
				...(measurement.type ? { type: measurement.type } : {}),
				family: measurement.family,
			...(measurement.ivMode ? { ivMode: measurement.ivMode } : {}),
			...(measurement.itMode ? { itMode: measurement.itMode } : {}),
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
						headerRow: titleRow,
						isX: column === block.xColumn,
						rows,
						semanticMatcher,
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
	headerRow,
	isX,
	rows,
	semanticMatcher,
	titleSpan,
}: {
	readonly block: StructuredDataBlockCandidate;
	readonly column: number;
	readonly columnProfiles: readonly StructuredColumnProfile[];
	readonly headerRow?: number;
	readonly isX: boolean;
	readonly rows: readonly (readonly string[])[];
	readonly semanticMatcher: SemanticMatcher;
	readonly titleSpan?: StructuredColumnTitleSpanEvidence;
}): StructuredMeasurementColumnRef => {
	const profile = columnProfiles.find(candidate => candidate.rawCol === column);
	const role = titleSpan?.canonicalRole ?? (isX ? "unknown" : "unknown");
	const repeatedPairLegendText = isX ? null : createRepeatedPairLegendHeaderText({
		block,
		column,
		rows,
	});
	const headerText = repeatedPairLegendText ??
		titleSpan?.titleCell.text ??
		getHeaderCellText(rows, headerRow, column) ??
		profile?.headerText ??
		getFallbackColumnHeaderText(column);
	return {
		rawCol: column,
		headerText,
		role,
		unit: titleSpan?.canonicalUnit ?? null,
		dataRange: {
			startRow: block.startRow,
			endRow: block.endRow,
			startCol: column,
			endCol: column,
		},
		sourceRange: {
			startRow: titleSpan?.titleCell.row ?? headerRow ?? block.startRow,
			endRow: block.endRow,
			startCol: column,
			endCol: column,
		},
		confidence: titleSpan?.confidence ?? (headerRow !== undefined ? 0.72 : isX ? block.confidence : 0.6),
	};
};

const createRepeatedPairLegendHeaderText = ({
	block,
	column,
	rows,
}: {
	readonly block: StructuredDataBlockCandidate;
	readonly column: number;
	readonly rows: readonly (readonly string[])[];
}): string | null => {
	if (!block.reasons.includes("dataBlock.repeatedPairSharedX") || !block.dependentColumns.includes(column)) {
		return null;
	}
	const headerRow = block.startRow - 1;
	const pairTitle = parsePairAxisTitle(getHeaderCellText(rows, headerRow, column) ?? "");
	if (!pairTitle || pairTitle.axis !== "dependent") {
		return null;
	}
	return pairTitle.base;
};

const findAlignedBlockHeaderRow = ({
	block,
	rows,
}: {
	readonly block: StructuredDataBlockCandidate;
	readonly rows: readonly (readonly string[])[];
}): number | undefined => {
	const rowIndex = block.startRow - 1;
	if (rowIndex < 0) {
		return undefined;
	}
	const columns = [block.xColumn, ...block.dependentColumns];
	const headerTexts = columns.map(column => getHeaderCellText(rows, rowIndex, column));
	if (headerTexts.some(text => !text)) {
		return undefined;
	}
	const xHeader = headerTexts[0];
	if (!xHeader || parseFiniteNumber(xHeader) !== null) {
		return undefined;
	}
	const dependentHeaders = headerTexts.slice(1);
	if (dependentHeaders.length > 1 && new Set(dependentHeaders.map(normalizeHeaderLegendText)).size !== dependentHeaders.length) {
		return undefined;
	}
	return rowIndex;
};

const getHeaderCellText = (
	rows: readonly (readonly string[])[],
	rowIndex: number | undefined,
	column: number,
): string | null => {
	if (rowIndex === undefined) {
		return null;
	}
	const text = normalizeText(rows[rowIndex]?.[column]);
	return text || null;
};

const normalizeHeaderLegendText = (
	value: string | null,
): string => normalizeText(value).toLowerCase();

const inferMeasurementForBlock = (
	block: StructuredDataBlockCandidate,
	context: {
		readonly rows: readonly (readonly string[])[];
		readonly semanticMatcher: SemanticMatcher;
		readonly titleSpansByColumn: ReadonlyMap<number, StructuredColumnTitleSpanEvidence>;
		readonly xGroupCandidates: readonly StructuredXGroupCandidate[];
	},
): {
	readonly type?: string;
	readonly family: StructuredMeasurementFamily;
	readonly ivMode?: StructuredMeasurementBlockRecord["ivMode"];
	readonly itMode?: StructuredMeasurementBlockRecord["itMode"];
} => {
	const rule = selectBlockRule(block, context);
	if (rule?.type) {
		return toMeasurementFromType(rule.type);
	}
	if (rule) {
		return {
			type: rule.label,
			family: "unknown",
		};
	}
	return { family: "unknown" };
};

const selectBlockRule = (
	block: StructuredDataBlockCandidate,
	context: {
		readonly rows: readonly (readonly string[])[];
		readonly semanticMatcher: SemanticMatcher;
		readonly titleSpansByColumn: ReadonlyMap<number, StructuredColumnTitleSpanEvidence>;
		readonly xGroupCandidates: readonly StructuredXGroupCandidate[];
	},
): {
	readonly id: string;
	readonly label: string;
	readonly type?: string;
	readonly priorityIndex: number;
} | null => {
	const { rows, semanticMatcher, titleSpansByColumn, xGroupCandidates } = context;
	const xRules = titleSpansByColumn.get(block.xColumn)?.semanticRules
		.filter(rule => rule.axisTendency === "x") ?? [];
	const proofEvidenceByRuleId = collectBlockProofEvidence({
		block,
		rows,
		titleSpansByColumn,
		xGroupCandidates,
	});
	let candidates: readonly BlockRuleCandidate[] = xRules.length
		? createDirectXYRuleCandidates({
			block,
			proofEvidenceByRuleId,
			titleSpansByColumn,
			xRules,
		})
		: [];
	if (!candidates.length) {
		candidates = createRepeatedPairHeaderRuleCandidates({
			block,
			proofEvidenceByRuleId,
			rows,
			semanticMatcher,
		});
	}
	if (!candidates.length) {
		candidates = createAlignedHeaderXRuleCandidates({
			block,
			proofEvidenceByRuleId,
			rows,
			semanticMatcher,
		});
	}
	if (!candidates.length) {
		return null;
	}
	const bestProofScore = Math.max(...candidates.map(candidate => candidate.proofScore));
	const strongestCandidates = candidates.filter(candidate => candidate.proofScore === bestProofScore);
	const bestProofEvidenceCount = Math.max(...strongestCandidates.map(candidate => candidate.proofEvidenceCount));
	const strongestEvidenceCandidates = strongestCandidates.filter(candidate =>
		candidate.proofEvidenceCount === bestProofEvidenceCount
	);
	const bestDirectPairScore = Math.max(...strongestEvidenceCandidates.map(candidate => candidate.directPairScore));
	const strongestDirectPairCandidates = strongestEvidenceCandidates.filter(candidate =>
		candidate.directPairScore === bestDirectPairScore
	);
	const strongestTypes = new Set(strongestDirectPairCandidates.map(candidate => candidate.type).filter(Boolean));
	if (strongestTypes.has("transfer") && strongestTypes.has("output")) {
		return null;
	}
	return strongestDirectPairCandidates
		.sort((left, right) => left.priorityIndex - right.priorityIndex)[0] ?? null;
};

const createDirectXYRuleCandidates = ({
	block,
	proofEvidenceByRuleId,
	titleSpansByColumn,
	xRules,
}: {
	readonly block: StructuredDataBlockCandidate;
	readonly proofEvidenceByRuleId: ReadonlyMap<string, readonly BlockProofColumnKind[]>;
	readonly titleSpansByColumn: ReadonlyMap<number, StructuredColumnTitleSpanEvidence>;
	readonly xRules: readonly HeaderSemanticRuleMatch[];
}): readonly BlockRuleCandidate[] => {
	const candidatesByRuleId = new Map<string, BlockRuleCandidate>();
	for (const column of block.dependentColumns) {
		const yRules = titleSpansByColumn.get(column)?.semanticRules
			.filter(rule => rule.axisTendency === "dependent") ?? [];
		for (const xRule of xRules) {
			const yRule = yRules.find(rule => rule.id === xRule.id);
			if (!yRule) {
				continue;
			}
			const proofEvidence = proofEvidenceByRuleId.get(xRule.id) ?? [];
			const directPairScore = getDirectXYPairScore(block, column);
			const candidate: BlockRuleCandidate = {
				id: xRule.id,
				label: xRule.label,
				...(xRule.type ? { type: xRule.type } : {}),
				directPairScore,
				priorityIndex: Math.min(xRule.priorityIndex, yRule.priorityIndex),
				proofEvidenceCount: proofEvidence.length,
				proofScore: getBlockRuleProofScore(xRule.type, proofEvidence),
			};
			const current = candidatesByRuleId.get(candidate.id);
			if (
				!current ||
				candidate.directPairScore > current.directPairScore ||
				candidate.priorityIndex < current.priorityIndex
			) {
				candidatesByRuleId.set(candidate.id, candidate);
			}
		}
	}
	return Array.from(candidatesByRuleId.values());
};

const getDirectXYPairScore = (
	block: StructuredDataBlockCandidate,
	dependentColumn: number,
): number => {
	let score = 1;
	if (dependentColumn === block.dependentColumns[0]) {
		score += 1;
	}
	if (
		(block.columnDirection === "rightPreferred" && dependentColumn > block.xColumn) ||
		(block.columnDirection === "leftObserved" && dependentColumn < block.xColumn)
	) {
		score += 0.5;
	}
	if (Math.abs(dependentColumn - block.xColumn) === 1) {
		score += 2;
	}
	return score;
};

const createRepeatedPairHeaderRuleCandidates = ({
	block,
	proofEvidenceByRuleId,
	rows,
	semanticMatcher,
}: {
	readonly block: StructuredDataBlockCandidate;
	readonly proofEvidenceByRuleId: ReadonlyMap<string, readonly BlockProofColumnKind[]>;
	readonly rows: readonly (readonly string[])[];
	readonly semanticMatcher: SemanticMatcher;
}): readonly BlockRuleCandidate[] => {
	const bases = readRepeatedPairHeaderBases({ block, rows, semanticMatcher });
	if (!bases.length) {
		return [];
	}
	return createRuleCandidatesFromSemanticMatches({
		matches: bases.flatMap(base => matchHeaderTitleParts(base, semanticMatcher)),
		proofEvidenceByRuleId,
		shouldUseRule: rule =>
			rule.axisTendency === "x" ||
			rule.axisTendency === "dependent" ||
			rule.axisTendency === "unknown",
	});
};

const readRepeatedPairHeaderBases = ({
	block,
	rows,
	semanticMatcher,
}: {
	readonly block: StructuredDataBlockCandidate;
	readonly rows: readonly (readonly string[])[];
	readonly semanticMatcher: SemanticMatcher;
}): readonly string[] => {
	if (
		block.columnDirection !== "rightPreferred" ||
		!block.reasons.includes("dataBlock.repeatedPairSharedX")
	) {
		return [];
	}
	const headerRow = block.startRow - 1;
	if (headerRow < 0) {
		return [];
	}
	const bases: string[] = [];
	for (const dependentColumn of block.dependentColumns) {
		const pairXColumn = dependentColumn - 1;
		if (pairXColumn < block.startCol || pairXColumn >= dependentColumn) {
			return [];
		}
		const xTitle = parsePairAxisTitle(getHeaderCellText(rows, headerRow, pairXColumn) ?? "");
		const yTitle = parsePairAxisTitle(getHeaderCellText(rows, headerRow, dependentColumn) ?? "");
		if (
			!xTitle ||
			!yTitle ||
			xTitle.axis !== "x" ||
			yTitle.axis !== "dependent" ||
			semanticMatcher.toKey(xTitle.base) !== semanticMatcher.toKey(yTitle.base)
		) {
			return [];
		}
		bases.push(xTitle.base);
	}
	return bases;
};

const createAlignedHeaderXRuleCandidates = ({
	block,
	proofEvidenceByRuleId,
	rows,
	semanticMatcher,
}: {
	readonly block: StructuredDataBlockCandidate;
	readonly proofEvidenceByRuleId: ReadonlyMap<string, readonly BlockProofColumnKind[]>;
	readonly rows: readonly (readonly string[])[];
	readonly semanticMatcher: SemanticMatcher;
}): readonly BlockRuleCandidate[] => {
	const headerRow = findAlignedBlockHeaderRow({ block, rows });
	const xHeader = getHeaderCellText(rows, headerRow, block.xColumn);
	if (!xHeader) {
		return [];
	}
	return createRuleCandidatesFromSemanticMatches({
		matches: matchHeaderTitleParts(xHeader, semanticMatcher),
		proofEvidenceByRuleId,
		shouldUseRule: rule => rule.axisTendency === "x",
	});
};

const matchHeaderTitleParts = (
	value: string,
	semanticMatcher: SemanticMatcher,
): readonly HeaderSemanticMatch[] => {
	const text = normalizeText(value);
	const parts = uniqueStrings([
		text,
		...createParenthesizedHeaderTitleParts(text),
	]);
	return parts
		.map(part => semanticMatcher.matchTitle(part))
		.filter((match): match is HeaderSemanticMatch => Boolean(match));
};

const createParenthesizedHeaderTitleParts = (
	value: string,
): readonly string[] => {
	const group = parseTrailingParenthesizedHeaderPart(value);
	if (!group) {
		return [];
	}
	return uniqueStrings([
		group.outerText,
		group.innerText,
	]);
};

const createRuleCandidatesFromSemanticMatches = ({
	matches,
	proofEvidenceByRuleId,
	shouldUseRule,
}: {
	readonly matches: readonly HeaderSemanticMatch[];
	readonly proofEvidenceByRuleId: ReadonlyMap<string, readonly BlockProofColumnKind[]>;
	readonly shouldUseRule: (rule: HeaderSemanticRuleMatch) => boolean;
}): readonly BlockRuleCandidate[] => {
	const rulesById = new Map<string, BlockRuleCandidate>();
	for (const match of matches) {
		for (const rule of match.semanticRules) {
			if (!shouldUseRule(rule)) {
				continue;
			}
			const proofEvidence = proofEvidenceByRuleId.get(rule.id) ?? [];
			const current = rulesById.get(rule.id);
			const candidate = {
				id: rule.id,
				label: rule.label,
				...(rule.type ? { type: rule.type } : {}),
				directPairScore: 0,
				priorityIndex: rule.priorityIndex,
				proofEvidenceCount: proofEvidence.length,
				proofScore: getBlockRuleProofScore(rule.type, proofEvidence),
			};
			if (!current || candidate.priorityIndex < current.priorityIndex) {
				rulesById.set(rule.id, candidate);
			}
		}
	}
	return Array.from(rulesById.values());
};

const collectBlockProofEvidence = ({
	block,
	rows,
	titleSpansByColumn,
	xGroupCandidates,
}: {
	readonly block: StructuredDataBlockCandidate;
	readonly rows: readonly (readonly string[])[];
	readonly titleSpansByColumn: ReadonlyMap<number, StructuredColumnTitleSpanEvidence>;
	readonly xGroupCandidates: readonly StructuredXGroupCandidate[];
}): ReadonlyMap<string, readonly BlockProofColumnKind[]> => {
	const evidenceByRuleId = new Map<string, BlockProofColumnKind[]>();
	const blockColumns = new Set([block.xColumn, ...block.dependentColumns]);
	for (const [column, titleSpan] of titleSpansByColumn) {
		const rules = titleSpan.semanticRules.filter(rule => rule.axisTendency === "unknown");
		if (!rules.length) {
			continue;
		}
		const proofKind = blockColumns.has(column)
			? "title"
			: getBlockProofColumnKind({
				block,
				column,
				rows,
				xGroupCandidates,
			});
		for (const rule of rules) {
			if (proofKind === "none") {
				continue;
			}
			const kinds = evidenceByRuleId.get(rule.id) ?? [];
			kinds.push(proofKind);
			evidenceByRuleId.set(rule.id, kinds);
		}
	}
	return evidenceByRuleId;
};

const getBlockRuleProofScore = (
	ruleType: string | undefined,
	proofEvidence: readonly BlockProofColumnKind[] | undefined,
): number => {
	if (!proofEvidence?.length) {
		return 0;
	}
	const baseScore = proofEvidence.length;
	const steppedOutputBonus = ruleType === "output"
		? proofEvidence.filter(kind => kind === "steppedByXGroup").length
		: 0;
	return baseScore + steppedOutputBonus;
};

type BlockProofColumnKind = "none" | "title" | "constantByXGroup" | "steppedByXGroup";

const getBlockProofColumnKind = ({
	block,
	column,
	rows,
	xGroupCandidates,
}: {
	readonly block: StructuredDataBlockCandidate;
	readonly column: number;
	readonly rows: readonly (readonly string[])[];
	readonly xGroupCandidates: readonly StructuredXGroupCandidate[];
}): BlockProofColumnKind => {
	if (getNumericCoverage(rows, column, block.startRow, block.endRow) < 0.8) {
		return "title";
	}
	const groups = xGroupCandidates
		.filter(group => block.xGroupCandidateIds.includes(group.id))
		.sort((left, right) => left.startRow - right.startRow);
	const ranges = groups.length
		? groups.map(group => ({ startRow: group.startRow, endRow: group.endRow }))
		: [{ startRow: block.startRow, endRow: block.endRow }];
	const proofValueTolerance = getProofColumnValueTolerance(rows, column, block.startRow, block.endRow);
	const representatives: number[] = [];
	for (const range of ranges) {
		const values = readNumericValues(rows, column, range.startRow, range.endRow);
		const rowCount = range.endRow - range.startRow + 1;
		if (values.length / Math.max(1, rowCount) < 0.8 || values.length < 2) {
			return "none";
		}
		const representative = values[0] ?? 0;
		if (!values.every(value => nearlyEqualWithTolerance(value, representative, proofValueTolerance))) {
			return "none";
		}
		representatives.push(representative);
	}
	if (representatives.length <= 1 || representatives.every(value => nearlyEqual(value, representatives[0] ?? 0))) {
		return "constantByXGroup";
	}
	const direction = getDirection(createDiffs(representatives));
	return getMonotonicity(createDiffs(representatives), direction) >= 0.98
		? "steppedByXGroup"
		: "none";
};

const getProofColumnValueTolerance = (
	rows: readonly (readonly string[])[],
	column: number,
	startRow: number,
	endRow: number,
): number => {
	const values = readNumericValues(rows, column, startRow, endRow);
	if (!values.length) {
		return ProofColumnAbsoluteTolerance;
	}
	const min = Math.min(...values);
	const max = Math.max(...values);
	const span = Math.abs(max - min);
	const scale = Math.max(Math.abs(min), Math.abs(max));
	return Math.max(ProofColumnAbsoluteTolerance, span * 1e-6, scale * 1e-9);
};

const toMeasurementFromType = (
	measurementType: string,
): {
	readonly type: string;
	readonly family: StructuredMeasurementFamily;
	readonly ivMode?: StructuredMeasurementBlockRecord["ivMode"];
	readonly itMode?: StructuredMeasurementBlockRecord["itMode"];
} => {
	const normalized = measurementType.trim().toLowerCase();
	if (normalized === "transfer") {
		return { type: measurementType, family: "iv", ivMode: "transfer" };
	}
	if (normalized === "output") {
		return { type: measurementType, family: "iv", ivMode: "output" };
	}
	if (normalized === "iv") {
		return { type: measurementType, family: "iv" };
	}
	if (normalized === "cv") {
		return { type: measurementType, family: "cv" };
	}
	if (normalized === "cf" || normalized === "frequency") {
		return { type: measurementType, family: "cf" };
	}
	if (normalized === "pv") {
		return { type: measurementType, family: "pv" };
	}
	if (normalized === "transient") {
		return { type: measurementType, family: "it", itMode: "transient" };
	}
	return { type: measurementType, family: "unknown" };
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
	values: NumericValues,
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
	values: NumericValues,
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
	values: NumericValues,
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
	values: NumericValues,
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
	values: NumericValues,
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
		uniqueRatio: new Set(Array.from(finiteValues, value => String(value))).size / Math.max(1, finiteValues.length),
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

const haveSameNumericValues = (
	rows: readonly (readonly string[])[],
	leftColumn: number,
	rightColumn: number,
	startRow: number,
	endRow: number,
): boolean => {
	const leftValues = readNumericValues(rows, leftColumn, startRow, endRow);
	const rightValues = readNumericValues(rows, rightColumn, startRow, endRow);
	return leftValues.length >= 2 &&
		leftValues.length === rightValues.length &&
		leftValues.every((value, index) => nearlyEqual(value, rightValues[index] ?? Number.NaN));
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
		readonly type?: string;
		readonly family: StructuredMeasurementFamily;
		readonly ivMode?: StructuredMeasurementBlockRecord["ivMode"];
	},
): string => {
	if (measurement.type) {
		return `Detected ${formatMeasurementTypeLabel(measurement.type)}`;
	}
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

const formatMeasurementTypeLabel = (
	measurementType: string,
): string => measurementType
	.trim()
	.split(/[\s_-]+/g)
	.filter(Boolean)
	.map(part => part.length ? `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}` : "")
	.join(" ");

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

const nearlyEqual = (
	left: number,
	right: number,
): boolean => Math.abs(left - right) <= Math.max(NumberTolerance, Math.max(Math.abs(left), Math.abs(right)) * 1e-9);

const nearlyEqualWithTolerance = (
	left: number,
	right: number,
	tolerance: number,
): boolean => Math.abs(left - right) <= tolerance;

const average = (
	values: NumericValues,
): number => {
	let total = 0;
	for (const value of values) {
		total += value;
	}
	return values.length ? total / values.length : 0;
};

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

const uniqueStrings = <T extends string>(
	values: readonly T[],
): T[] => {
	const seen = new Set<T>();
	const result: T[] = [];
	for (const value of values) {
		if (seen.has(value)) {
			continue;
		}
		seen.add(value);
		result.push(value);
	}
	return result;
};
