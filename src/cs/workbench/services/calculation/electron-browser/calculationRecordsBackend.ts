/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from "src/cs/base/common/lifecycle";
import { CancellationToken } from "src/cs/base/common/cancellation";
import { workbenchIpcChannels } from "src/cs/workbench/common/ipcChannels";
import { startPerf } from "src/cs/workbench/common/perf";
import {
	CalculationAnalysisVersion,
	type CalculationAnalysisBySeriesId,
	type CalculationSeriesAnalysis,
} from "src/cs/workbench/services/calculation/common/calculationAnalysis";
import {
	CalculationRecordsBackendInput,
	CalculationRecordsBackendOutput,
	ICalculationRecordsBackend,
} from "src/cs/workbench/services/calculation/common/calculationRecordsBackend";
import {
	type CalculationRecordsInput,
	calculationSupportsSs,
	collectCalculationBaseCurves,
	getCalculationCurveType,
} from "src/cs/workbench/services/calculation/common/calculationRecords";
import type {
	BaseCurrentMetrics,
	CurrentWindowMeta,
} from "src/cs/workbench/services/calculation/common/ionIoff";
import type {
	CurvePoint,
} from "src/cs/workbench/services/calculation/common/calculationRecords";

type RustHostResponse =
	| {
		readonly durationMs?: number;
		readonly ok: true;
		readonly result?: unknown;
		readonly source?: unknown;
	}
	| {
		readonly code?: unknown;
		readonly durationMs?: number;
		readonly message?: unknown;
		readonly ok: false;
	};

type RustCalculationSeriesPayload = {
	readonly id: string;
	readonly x: readonly number[];
	readonly y: readonly number[];
};

type RustCalculationPayload = {
	readonly fileId: string;
	readonly series: readonly RustCalculationSeriesPayload[];
	readonly sourceFile: {
		readonly curveType?: string;
		readonly supportsSs: boolean;
		readonly xAxisRole: "vg" | "vd" | null;
		readonly xLabel?: string;
	};
};

type DesktopIpcRenderer = {
	invoke(channel: string, ...args: unknown[]): Promise<unknown>;
};

type RustCalculationBridge = {
	analyzeCalculationWithRust?: (
		payload: RustCalculationPayload,
	) => Promise<RustHostResponse>;
};

export type RustCalculationTransport = {
	isSupported(): boolean;
	analyze(payload: RustCalculationPayload): Promise<RustHostResponse>;
};

export class ElectronCalculationRecordsBackend
	extends Disposable
	implements ICalculationRecordsBackend {

	private disposed = false;

	public constructor(
		private readonly fallbackBackend: ICalculationRecordsBackend,
		private readonly rustTransport: RustCalculationTransport = createRustCalculationTransport(),
	) {
		super();
		this._register(this.fallbackBackend);
	}

	public isSupported(): boolean {
		return !this.disposed &&
			(this.rustTransport.isSupported() || this.fallbackBackend.isSupported());
	}

	public async calculateRecords(
		input: CalculationRecordsBackendInput,
		token: CancellationToken = CancellationToken.None,
	): Promise<CalculationRecordsBackendOutput | null> {
		if (this.disposed || token.isCancellationRequested) {
			return null;
		}

		const payload = createRustCalculationPayload(input.records, input.requestId);
		if (payload && this.rustTransport.isSupported()) {
			const endPerf = startPerf("calculationBackend.rust", {
				pointCount: payload.series.reduce(
					(total, series) => total + series.x.length,
					0,
				),
				requestId: input.requestId,
				seriesCount: payload.series.length,
			});
			try {
				const response = await this.rustTransport.analyze(payload);
				if (token.isCancellationRequested) {
					endPerf({ result: "cancelled" });
					return null;
				}
				const analysisBySeriesId = readRustCalculationAnalysis(
					response,
					input.records,
					payload.fileId,
				);
				if (analysisBySeriesId) {
					const output = await this.fallbackBackend.calculateRecords({
						...input,
						analysisBySeriesId,
					}, token);
					if (output) {
						endPerf({
							curveCount: output.curves.length,
							metricCount: output.metrics.length,
							result: "rust",
							rustDurationMs: response.durationMs,
							rustSource: response.ok ? response.source : undefined,
						});
						return output;
					}
					endPerf({
						result: "workerMaterializationUnavailable",
						rustDurationMs: response.durationMs,
					});
					return null;
				}
				endPerf({
					result: response.ok ? "invalidResult" : "rustFailure",
					rustCode: response.ok ? undefined : response.code,
					rustDurationMs: response.durationMs,
				});
			} catch (error) {
				endPerf({
					error: error instanceof Error ? error.message : String(error),
					result: "transportFailure",
				});
			}
		}

		return this.fallbackBackend.calculateRecords(input, token);
	}

	public override dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
		super.dispose();
	}
}

const createRustCalculationPayload = (
	input: CalculationRecordsInput,
	requestId: number,
): RustCalculationPayload | null => {
	const series: RustCalculationSeriesPayload[] = [];
	const seenSeriesIds = new Set<string>();
	const baseCurves = collectCalculationBaseCurves(input);
	for (const curve of baseCurves) {
		if (seenSeriesIds.has(curve.seriesId)) {
			continue;
		}
		seenSeriesIds.add(curve.seriesId);

		const points = curve.points.filter(
			(point) => Number.isFinite(point.x) && Number.isFinite(point.y),
		);
		if (points.length < 3) {
			continue;
		}
		series.push({
			id: curve.seriesId,
			x: points.map((point) => point.x),
			y: points.map((point) => point.y),
		});
	}
	if (!series.length) {
		return null;
	}

	return {
		fileId: `calculation-${requestId}`,
		series,
		sourceFile: {
			curveType: getCalculationCurveType(baseCurves[0]),
			supportsSs: calculationSupportsSs(input),
			xAxisRole: input.axis.xAxisRole,
			xLabel: input.axis.xLabel,
		},
	};
};

const readRustCalculationAnalysis = (
	response: RustHostResponse,
	input: CalculationRecordsInput,
	analysisId: string,
): CalculationAnalysisBySeriesId | null => {
	if (!response.ok) {
		return null;
	}

	const result = readObject(response.result);
	if (
		!result ||
		String(result.fileId ?? "") !== analysisId ||
		Number(result.version) !== CalculationAnalysisVersion
	) {
		return null;
	}

	const rawSeriesById = readObject(result.series);
	if (!rawSeriesById) {
		return null;
	}

	const analysisBySeriesId: Record<string, CalculationSeriesAnalysis> = {};
	for (const curve of collectCalculationBaseCurves(input)) {
		const rawAnalysis = readObject(rawSeriesById[curve.seriesId]);
		if (!rawAnalysis) {
			continue;
		}

		const analysis: CalculationSeriesAnalysis = {
			baseCurrent: normalizeBaseCurrentMetrics(rawAnalysis.baseCurrent),
			gm: normalizeCurvePoints(rawAnalysis.gm),
			ss: normalizeCurvePoints(rawAnalysis.ss),
			ssFitAuto: normalizeSsFitResult(rawAnalysis.ssFitAuto),
		};
		if (
			analysis.baseCurrent ||
			analysis.gm ||
			analysis.ss ||
			analysis.ssFitAuto
		) {
			analysisBySeriesId[curve.seriesId] = analysis;
		}
	}

	return Object.keys(analysisBySeriesId).length
		? analysisBySeriesId
		: null;
};

const normalizeCurvePoints = (value: unknown): CurvePoint[] | undefined => {
	if (!Array.isArray(value)) {
		return undefined;
	}
	return value
		.map((item): CurvePoint | null => {
			const point = readObject(item);
			const x = point?.x;
			const y = point?.y;
			return (
				typeof x === "number" &&
				Number.isFinite(x) &&
				typeof y === "number" &&
				Number.isFinite(y)
			)
				? { x, y }
				: null;
		})
		.filter((point): point is CurvePoint => point !== null);
};

const normalizeBaseCurrentMetrics = (
	value: unknown,
): BaseCurrentMetrics | undefined => {
	const record = readObject(value);
	if (!record) {
		return undefined;
	}

	return {
		candidateWindows: Array.isArray(record.candidateWindows)
			? record.candidateWindows
				.map(normalizeCurrentWindow)
				.filter((window): window is CurrentWindowMeta => window !== null)
			: [],
		ioff: normalizeNumberOrNull(record.ioff),
		ioffWindow: normalizeCurrentWindow(record.ioffWindow),
		ion: normalizeNumberOrNull(record.ion),
		ionIoff: normalizeNumberOrNull(record.ionIoff),
		ionWindow: normalizeCurrentWindow(record.ionWindow),
		method: record.method === "auto" || record.method === "manual"
			? record.method
			: "unavailable",
		xAtIoff: normalizeNumberOrNull(record.xAtIoff),
		xAtIon: normalizeNumberOrNull(record.xAtIon),
	};
};

const normalizeSsFitResult = (
	value: unknown,
): Record<string, unknown> | undefined => {
	const result = readObject(value);
	if (!result) {
		return undefined;
	}

	const strict = normalizeSsFit(result.strict);
	const suggested = normalizeSsFit(result.suggested);
	return strict || suggested
		? {
			...(strict ? { strict } : {}),
			...(suggested ? { suggested } : {}),
		}
		: undefined;
};

const normalizeSsFit = (
	value: unknown,
): Record<string, unknown> | null => {
	const fit = readObject(value);
	if (!fit) {
		return null;
	}
	return {
		ok: fit.ok === true,
		ss: normalizeNumberOrNull(fit.ss),
		x1: normalizeNumberOrNull(fit.x1),
		x2: normalizeNumberOrNull(fit.x2),
	};
};

const normalizeCurrentWindow = (
	value: unknown,
): CurrentWindowMeta | null => {
	const record = readObject(value);
	const key = normalizeCurrentWindowKey(record?.key);
	if (!record || !key) {
		return null;
	}

	return {
		current: normalizeNumberOrNull(record.current),
		key,
		label: String(record.label ?? key),
		pointCount: Math.max(0, Math.floor(Number(record.pointCount) || 0)),
		targetX: normalizeNumberOrNull(record.targetX),
		x: normalizeNumberOrNull(record.x),
		x1: normalizeNumberOrNull(record.x1),
		x2: normalizeNumberOrNull(record.x2),
	};
};

const normalizeCurrentWindowKey = (
	value: unknown,
): CurrentWindowMeta["key"] | null => {
	switch (value) {
		case "lowEnd":
		case "highEnd":
		case "maxCurrent":
		case "minCurrent":
		case "zeroBias":
		case "manualIon":
		case "manualIoff":
			return value;
		default:
			return null;
	}
};

const normalizeNumberOrNull = (value: unknown): number | null => {
	if (value === null || value === undefined || value === "") {
		return null;
	}
	const number = Number(value);
	return Number.isFinite(number) ? number : null;
};

const readObject = (value: unknown): Record<string, unknown> | null =>
	value && typeof value === "object" && !Array.isArray(value)
		? value as Record<string, unknown>
		: null;

const createRustCalculationTransport = (): RustCalculationTransport => ({
	isSupported: () =>
		typeof getBridge()?.analyzeCalculationWithRust === "function" ||
		typeof getIpcRenderer()?.invoke === "function",
	async analyze(payload) {
		const bridgeMethod = getBridge()?.analyzeCalculationWithRust;
		if (typeof bridgeMethod === "function") {
			return bridgeMethod(payload);
		}

		const ipcRenderer = getIpcRenderer();
		if (!ipcRenderer) {
			throw new Error("Rust calculation bridge is unavailable.");
		}
		return ipcRenderer.invoke(
			workbenchIpcChannels.rustHostAnalyzeCalculation,
			payload,
		) as Promise<RustHostResponse>;
	},
});

const getBridge = (): RustCalculationBridge | null => {
	const bridge = (
		globalThis.window as Window & {
			desktopImport?: RustCalculationBridge;
		} | undefined
	)?.desktopImport;
	return bridge && typeof bridge === "object" ? bridge : null;
};

const getIpcRenderer = (): DesktopIpcRenderer | null => {
	const ipcRenderer = (
		globalThis.window as Window & {
			conductor?: { ipcRenderer?: DesktopIpcRenderer };
		} | undefined
	)?.conductor?.ipcRenderer;
	return ipcRenderer && typeof ipcRenderer.invoke === "function"
		? ipcRenderer
		: null;
};
