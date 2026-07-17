/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import {
	CancellationToken,
	CancellationTokenSource,
} from "src/cs/base/common/cancellation";
import { disposableTimeout, raceCancellation } from "src/cs/base/common/async";
import { CancellationError } from "src/cs/base/common/errors";
import { Emitter, type Event } from "src/cs/base/common/event";
import { Disposable, type IDisposable } from "src/cs/base/common/lifecycle";
import type { URI } from "src/cs/base/common/uri";
import {
	IFileService,
	type IFileStat,
} from "src/cs/platform/files/common/files";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import { workbenchIpcChannels } from "src/cs/workbench/common/ipcChannels";
import { logPerf } from "src/cs/workbench/common/perf";
import { DataResourceService } from "src/cs/workbench/services/dataResource/browser/dataResourceService";
import {
	IDataResourceService,
} from "src/cs/workbench/services/dataResource/common/dataResource";
import {
	type DataResourceContentSheetSnapshot,
	type DataResourceContentSnapshot,
	IDataResourceContentService,
	type IDataResourceContentService as IDataResourceContentServiceType,
	type IDataResourceContentReference,
} from "src/cs/workbench/services/dataResource/common/dataResourceContentService";
import {
	IDataResourceEvidenceContentService,
} from "src/cs/workbench/services/dataResource/common/dataResourceEvidenceContentService";
import type {
	StructuredContentColumnFacts,
	StructuredContentGridSnapshot,
	StructuredContentNumericRun,
	StructuredContentRowWindow,
	StructuredContentValueRun,
} from "src/cs/workbench/services/dataResource/common/structuredContent";
import { IStructuredContentEvidenceService } from "src/cs/workbench/services/dataResource/common/structuredContentEvidenceService";
import { ISettingsService } from "src/cs/workbench/services/settings/common/settings";
import { tableFormatService } from "src/cs/workbench/services/table/common/tableFormatService";
import type { TableParseDiagnostic } from "src/cs/workbench/services/table/common/model";

type RustHostResponse =
	| {
		readonly ok: true;
		readonly durationMs?: number;
		readonly result?: unknown;
	}
	| {
		readonly ok: false;
		readonly code: string;
		readonly durationMs?: number;
		readonly message: string;
	};

type RustStructuredContentBridge = {
	cancelStructuredContentWithRust?: (payload: {
		readonly requestId: string;
	}) => Promise<unknown>;
	resolveStructuredContentWithRust?: (payload: {
		readonly fileName: string;
		readonly path: string;
		readonly requestId: string;
	}) => Promise<RustHostResponse>;
};

type DesktopIpcRenderer = {
	invoke(channel: string, ...args: unknown[]): Promise<unknown>;
};

const MaxStableReadAttempts = 3;

type PendingRustResolve = {
	readonly cancellation: CancellationTokenSource;
	readonly promise: Promise<DataResourceContentSnapshot>;
};

type RustStructuredContentRequestHandle = {
	readonly promise: Promise<RustHostResponse>;
	cancel(): void;
};

export class RustDataResourceEvidenceContentService extends Disposable implements IDataResourceEvidenceContentService {
	public declare readonly _serviceBrand: undefined;

	private readonly onDidChangeContentEmitter = this._register(new Emitter<URI>());
	public readonly onDidChangeContent: Event<URI> = this.onDidChangeContentEmitter.event;
	private readonly contentVersions = new Map<string, number>();
	private readonly generations = new Map<string, number>();
	private readonly orphanCancellationByKey = new Map<string, IDisposable>();
	private readonly pendingResolves = new Map<string, PendingRustResolve>();
	private readonly referenceCounts = new Map<string, number>();
	private readonly snapshots = new Map<string, DataResourceContentSnapshot>();
	private requestIdPool = 0;

	public constructor(
		@IFileService private readonly fileService: IFileService,
	) {
		super();
		this._register(this.fileService.onDidFilesChange(changes => {
			for (const change of changes) {
				if (!this.canHandleResource(change.resource)) {
					continue;
				}
				const key = change.resource.toString();
				this.generations.set(key, (this.generations.get(key) ?? 0) + 1);
				this.snapshots.delete(key);
				this.onDidChangeContentEmitter.fire(change.resource);
			}
		}));
		this._register({
			dispose: () => {
				for (const cancellation of this.orphanCancellationByKey.values()) {
					cancellation.dispose();
				}
				this.orphanCancellationByKey.clear();
				for (const pending of this.pendingResolves.values()) {
					pending.cancellation.cancel();
					pending.cancellation.dispose();
				}
				this.pendingResolves.clear();
				this.referenceCounts.clear();
				this.snapshots.clear();
			},
		});
	}

	public canHandleResource(resource: URI): boolean {
		return resource.scheme === "file" &&
			tableFormatService.canHandle(resource) &&
			(hasBridgeMethod() || hasIpcRenderer());
	}

	public async createContentReference(
		resource: URI,
		token: CancellationToken = CancellationToken.None,
	): Promise<IDataResourceContentReference> {
		if (!this.canHandleResource(resource)) {
			throw new Error(`Rust evidence content does not support ${resource.toString()}.`);
		}
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}

		const key = resource.toString();
		this.retainReference(key);
		let released = false;
		const release = (): void => {
			if (released) {
				return;
			}
			released = true;
			this.releaseReference(key);
		};
		const cancellationListener = token.onCancellationRequested(release);
		try {
			const object = await raceCancellation(this.resolveContent(resource), token);
			if (!object || token.isCancellationRequested) {
				throw new CancellationError();
			}
			cancellationListener.dispose();
			return {
				kind: "file",
				object,
				dispose: () => {
					release();
				},
			};
		} catch (error) {
			cancellationListener.dispose();
			release();
			throw error;
		}
	}

	public get(resource: URI | null | undefined): DataResourceContentSnapshot | undefined {
		return resource ? this.snapshots.get(resource.toString()) : undefined;
	}

	private async resolveContent(resource: URI): Promise<DataResourceContentSnapshot> {
		const key = resource.toString();
		const cached = this.snapshots.get(key);
		if (cached) {
			return cached;
		}
		const pending = this.pendingResolves.get(key);
		if (pending) {
			return pending.promise;
		}

		const cancellation = new CancellationTokenSource();
		let pendingResolve!: PendingRustResolve;
		const promise = this.resolveStableContent(resource, cancellation.token)
			.then(snapshot => {
				if (
					this.referenceCounts.has(key) &&
					this.pendingResolves.get(key) === pendingResolve
				) {
					this.snapshots.set(key, snapshot);
				}
				return snapshot;
			})
			.finally(() => {
				if (this.pendingResolves.get(key) === pendingResolve) {
					this.pendingResolves.delete(key);
				}
				cancellation.dispose();
			});
		pendingResolve = {
			cancellation,
			promise,
		};
		this.pendingResolves.set(key, pendingResolve);
		return promise;
	}

	private async resolveStableContent(
		resource: URI,
		token: CancellationToken,
	): Promise<DataResourceContentSnapshot> {
		const key = resource.toString();
		for (let attempt = 0; attempt < MaxStableReadAttempts; attempt += 1) {
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}
			const generation = this.generations.get(key) ?? 0;
			const before = await this.fileService.stat(resource);
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}
			const startedAt = performance.now();
			const request = invokeRustStructuredContent({
				fileName: getFileName(resource),
				path: resource.fsPath,
				requestId: this.createRequestId(),
			});
			const cancellationListener = token.onCancellationRequested(() => request.cancel());
			let response: RustHostResponse | undefined;
			try {
				response = await raceCancellation(request.promise, token);
			} finally {
				cancellationListener.dispose();
			}
			if (!response || token.isCancellationRequested) {
				throw new CancellationError();
			}
			const after = await this.fileService.stat(resource);
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}
			logPerf("dataResource.rustEvidenceContent.resolve", {
				attempt,
				durationMs: performance.now() - startedAt,
				rustDurationMs: response.durationMs ?? 0,
				success: response.ok,
			}, { silent: true });

			if (
				generation !== (this.generations.get(key) ?? 0) ||
				!isSameFileStat(before, after)
			) {
				continue;
			}
			const version = this.nextContentVersion(key);
			return response.ok
				? createResolvedSnapshot(resource, response.result, after, version)
				: createErrorSnapshot(resource, response.message, after, version);
		}
		throw new Error("The data resource changed while Rust was resolving Review evidence.");
	}

	private createRequestId(): string {
		this.requestIdPool += 1;
		return `data-resource-structured-${this.requestIdPool}`;
	}

	private nextContentVersion(key: string): number {
		const version = (this.contentVersions.get(key) ?? 0) + 1;
		this.contentVersions.set(key, version);
		return version;
	}

	private retainReference(key: string): void {
		this.orphanCancellationByKey.get(key)?.dispose();
		this.orphanCancellationByKey.delete(key);
		this.referenceCounts.set(key, (this.referenceCounts.get(key) ?? 0) + 1);
	}

	private releaseReference(key: string): void {
		const count = (this.referenceCounts.get(key) ?? 0) - 1;
		if (count > 0) {
			this.referenceCounts.set(key, count);
			return;
		}
		this.referenceCounts.delete(key);
		this.snapshots.delete(key);
		const pending = this.pendingResolves.get(key);
		if (!pending || this.orphanCancellationByKey.has(key)) {
			return;
		}
		const cancellation = disposableTimeout(() => {
			this.orphanCancellationByKey.delete(key);
			if (
				this.referenceCounts.has(key) ||
				this.pendingResolves.get(key) !== pending
			) {
				return;
			}
			this.pendingResolves.delete(key);
			pending.cancellation.cancel();
		});
		this.orphanCancellationByKey.set(key, cancellation);
	}
}

class ElectronDataResourceService extends DataResourceService {
	public constructor(
		@IDataResourceContentService contentService: IDataResourceContentServiceType,
		@ISettingsService settingsService: ISettingsService,
		@IStructuredContentEvidenceService structuredContentEvidenceService: IStructuredContentEvidenceService,
		@IDataResourceEvidenceContentService evidenceContentService: IDataResourceEvidenceContentService,
	) {
		super(
			contentService,
			settingsService,
			structuredContentEvidenceService,
			evidenceContentService,
		);
	}
}

const createResolvedSnapshot = (
	resource: URI,
	rawResult: unknown,
	stat: IFileStat,
	version: number,
): DataResourceContentSnapshot => {
	const result = readObject(rawResult);
	const format = tableFormatService.resolveFormat(resource);
	const diagnostics = readDiagnostics(result?.diagnostics);
	const sheets = readSheets(result?.sheets);
	const defaultSheetId = readOptionalString(result?.defaultSheetId) ??
		sheets.find(sheet => sheet.content)?.sheetId ??
		null;
	let content = readContent(result?.content);
	if (!content && defaultSheetId) {
		content = sheets.find(sheet => sheet.sheetId === defaultSheetId)?.content ?? null;
	}
	if (!content) {
		content = sheets.find(sheet => sheet.content)?.content ?? null;
	}
	const normalizedSheets = sheets.length
		? sheets
		: content
			? [{
				content,
				diagnostics,
				sheetId: defaultSheetId ?? "0",
				sheetName: null,
			}]
			: [];
	return {
		content,
		defaultSheetId: defaultSheetId ?? normalizedSheets[0]?.sheetId ?? null,
		diagnostics,
		errorMessage: null,
		format,
		resource,
		sheets: normalizedSheets,
		sourceVersion: normalizeVersion(stat.mtime),
		version,
	};
};

const createErrorSnapshot = (
	resource: URI,
	message: string,
	stat: IFileStat,
	version: number,
): DataResourceContentSnapshot => ({
	content: null,
	defaultSheetId: null,
	diagnostics: [],
	errorMessage: message.trim() || "Rust could not resolve structured content.",
	format: tableFormatService.resolveFormat(resource),
	resource,
	sheets: [],
	sourceVersion: normalizeVersion(stat.mtime),
	version,
});

const readContent = (value: unknown): StructuredContentGridSnapshot | null => {
	const record = readObject(value);
	if (!record) {
		return null;
	}
	const columnCount = readNonNegativeInteger(record.columnCount);
	const rowCount = readNonNegativeInteger(record.rowCount);
	const columnFacts = readColumnFacts(record.columnFacts, columnCount);
	if (columnFacts.length !== columnCount) {
		return null;
	}
	return {
		columnCount,
		columnFacts,
		contentFingerprint: readString(record.contentFingerprint),
		maxCellLengths: readNumberArray(record.maxCellLengths, columnCount),
		rowCount,
		rows: readRows(record.rows),
		rowWindows: readRowWindows(record.rowWindows),
		sparseRows: record.sparseRows === true,
	};
};

const readColumnFacts = (
	value: unknown,
	columnCount: number,
): readonly StructuredContentColumnFacts[] => {
	if (!Array.isArray(value)) {
		return [];
	}
	return value.slice(0, columnCount).map((candidate, column) => {
		const record = readObject(candidate);
		const numericRuns = readNumericRuns(record?.numericRuns);
		const kind = record?.kind;
		return {
			column,
			kind: kind === "numeric" || kind === "text" || kind === "mixed"
				? kind
				: "empty",
			...(readValueRun(record?.longestValueRun)
				? { longestValueRun: readValueRun(record?.longestValueRun)! }
				: {}),
			...(readValueRun(record?.longestNumericRun)
				? { longestNumericRun: readValueRun(record?.longestNumericRun)! }
				: {}),
			numericRuns,
		};
	});
};

const readNumericRuns = (value: unknown): readonly StructuredContentNumericRun[] =>
	Array.isArray(value)
		? value.map(candidate => {
			const record = readObject(candidate);
			const startRow = readNonNegativeInteger(record?.startRow);
			const endRow = Math.max(startRow, readNonNegativeInteger(record?.endRow));
			const values = Float64Array.from(readFiniteNumberArray(record?.values));
			return {
				startRow,
				endRow,
				pointCount: values.length,
				values,
			};
		})
		: [];

const readValueRun = (value: unknown): StructuredContentValueRun | null => {
	const record = readObject(value);
	if (!record) {
		return null;
	}
	const startRow = readNonNegativeInteger(record.startRow);
	const endRow = Math.max(startRow, readNonNegativeInteger(record.endRow));
	return {
		startRow,
		endRow,
		pointCount: endRow - startRow + 1,
	};
};

const readRowWindows = (value: unknown): readonly StructuredContentRowWindow[] =>
	Array.isArray(value)
		? value.map(candidate => {
			const record = readObject(candidate);
			return {
				startRowIndex: readNonNegativeInteger(record?.startRowIndex),
				rows: readRows(record?.rows),
			};
		})
		: [];

const readSheets = (value: unknown): readonly DataResourceContentSheetSnapshot[] =>
	Array.isArray(value)
		? value.map((candidate, index) => {
			const record = readObject(candidate);
			return {
				content: readContent(record?.content),
				diagnostics: readDiagnostics(record?.diagnostics),
				sheetId: readString(record?.sheetId) || String(index),
				sheetName: readOptionalString(record?.sheetName),
			};
		})
		: [];

const readDiagnostics = (value: unknown): readonly TableParseDiagnostic[] =>
	Array.isArray(value)
		? value.map(candidate => {
			const record = readObject(candidate);
			const severity = record?.severity;
			return {
				code: readString(record?.code) || "table.parser.nativeDiagnostic",
				message: readString(record?.message) || "Rust reported a table parse diagnostic.",
				severity: severity === "info" || severity === "warning" || severity === "error"
					? severity
					: "fatal",
				...(Number.isFinite(Number(record?.rowIndex))
					? { rowIndex: readNonNegativeInteger(record?.rowIndex) }
					: {}),
				...(Number.isFinite(Number(record?.columnIndex))
					? { columnIndex: readNonNegativeInteger(record?.columnIndex) }
					: {}),
				...(readOptionalString(record?.sheetId)
					? { sheetId: readOptionalString(record?.sheetId)! }
					: {}),
			};
		})
		: [];

const readRows = (value: unknown): readonly (readonly string[])[] =>
	Array.isArray(value)
		? value.map(row => Array.isArray(row) ? row.map(cell => String(cell ?? "")) : [])
		: [];

const readNumberArray = (value: unknown, length: number): readonly number[] =>
	Array.from({ length }, (_, index) => {
		const candidate = Array.isArray(value) ? Number(value[index]) : 0;
		return Number.isFinite(candidate) ? Math.max(0, Math.floor(candidate)) : 0;
	});

const readFiniteNumberArray = (value: unknown): readonly number[] =>
	Array.isArray(value)
		? value.map(Number).filter(Number.isFinite)
		: [];

const readObject = (value: unknown): Record<string, unknown> | null =>
	value && typeof value === "object" && !Array.isArray(value)
		? value as Record<string, unknown>
		: null;

const readString = (value: unknown): string =>
	typeof value === "string" ? value.trim() : "";

const readOptionalString = (value: unknown): string | null => {
	const text = readString(value);
	return text || null;
};

const readNonNegativeInteger = (value: unknown): number =>
	Math.max(0, Math.floor(Number(value) || 0));

const normalizeVersion = (value: unknown): number =>
	Math.max(0, Math.floor(Number(value) || 0));

const isSameFileStat = (left: IFileStat, right: IFileStat): boolean =>
	normalizeVersion(left.mtime) === normalizeVersion(right.mtime) &&
	normalizeVersion(left.size) === normalizeVersion(right.size);

const getFileName = (resource: URI): string => {
	const normalized = resource.path.replace(/\/+$/, "");
	return normalized.slice(normalized.lastIndexOf("/") + 1);
};

const getBridge = (): RustStructuredContentBridge | null => {
	const bridge = (
		globalThis.window as Window & {
			desktopImport?: RustStructuredContentBridge;
		} | undefined
	)?.desktopImport;
	return bridge && typeof bridge === "object" ? bridge : null;
};

const hasBridgeMethod = (): boolean =>
	typeof getBridge()?.resolveStructuredContentWithRust === "function";

const hasIpcRenderer = (): boolean => {
	const ipcRenderer = (
		globalThis.window as Window & {
			conductor?: { ipcRenderer?: DesktopIpcRenderer };
		} | undefined
	)?.conductor?.ipcRenderer;
	return typeof ipcRenderer?.invoke === "function";
};

const invokeRustStructuredContent = (payload: {
	readonly fileName: string;
	readonly path: string;
	readonly requestId: string;
}): RustStructuredContentRequestHandle => {
	const bridgeMethod = getBridge()?.resolveStructuredContentWithRust;
	let promise: Promise<RustHostResponse>;
	if (typeof bridgeMethod === "function") {
		promise = bridgeMethod(payload);
	} else {
		const ipcRenderer = getIpcRenderer();
		if (!ipcRenderer) {
			throw new Error("The Rust structured-content bridge is unavailable.");
		}
		promise = ipcRenderer.invoke(
			workbenchIpcChannels.rustHostResolveStructuredContent,
			payload,
		) as Promise<RustHostResponse>;
	}
	let cancelled = false;
	return {
		promise,
		cancel: () => {
			if (cancelled) {
				return;
			}
			cancelled = true;
			const cancelBridgeMethod = getBridge()?.cancelStructuredContentWithRust;
			if (typeof cancelBridgeMethod === "function") {
				void cancelBridgeMethod({ requestId: payload.requestId }).catch(() => {});
				return;
			}
			const ipcRenderer = getIpcRenderer();
			if (ipcRenderer) {
				void ipcRenderer.invoke(
					workbenchIpcChannels.rustHostCancelStructuredContent,
					{ requestId: payload.requestId },
				).catch(() => {});
			}
		},
	};
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

registerSingleton(
	IDataResourceEvidenceContentService,
	RustDataResourceEvidenceContentService,
	InstantiationType.Delayed,
);

registerSingleton(
	IDataResourceService,
	ElectronDataResourceService,
	InstantiationType.Delayed,
);
