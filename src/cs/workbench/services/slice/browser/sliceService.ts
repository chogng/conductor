/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import type { BrandedService } from "src/cs/platform/instantiation/common/instantiation";
import {
	ISessionService,
	type ISessionService as ISessionServiceType,
} from "src/cs/workbench/services/session/common/session";
import type {
	FileRecord,
	RawTableRef,
	TableRecord,
} from "src/cs/workbench/services/session/common/sessionModel";
import {
	IRawTableRowsReaderService,
	type IRawTableRowsReaderService as IRawTableRowsReaderServiceType,
} from "src/cs/workbench/services/files/common/rawTableRowsReader";
import {
	ISliceService,
	type ISliceService as ISliceServiceType,
	type RunSliceWithTemplateInput,
	type SliceFileState,
	type SliceMeasurementBinding,
	type SlicePlan,
	type SliceRequest,
	type SliceState,
} from "src/cs/workbench/services/slice/common/slice";
import { executeSlicePlan } from "src/cs/workbench/services/slice/common/sliceExecutor";
import {
	createSliceTableModelSignature,
	createSlicePlan,
} from "src/cs/workbench/services/slice/common/slicePlanner";
import {
	createReviewRecordSignature,
	type RawTableReviewRecord,
} from "src/cs/workbench/services/review/common/review";
import { createTemplateFingerprint } from "src/cs/workbench/services/template/common/templateFingerprint";
import type { Template } from "src/cs/workbench/services/template/common/templateSpec";
import type { TemplateSelection } from "src/cs/workbench/services/slice/common/templateSelection";
import { getTemplateSelectionTemplateId } from "src/cs/workbench/services/slice/common/templateSelection";
import {
	IUserTemplateService,
	type IUserTemplateService as IUserTemplateServiceType,
} from "src/cs/workbench/services/userTemplate/common/userTemplate";

type SliceQueueEntry = {
	readonly ref: RawTableRef;
	readonly plan: SlicePlan;
};

export class SliceService extends Disposable implements ISliceServiceType {
	public declare readonly _serviceBrand: undefined;

	private readonly onDidChangeSliceStateEmitter = this._register(new Emitter<void>());
	public readonly onDidChangeSliceState = this.onDidChangeSliceStateEmitter.event;

	private readonly fileStates = new Map<string, SliceFileState>();
	private readonly queue: SliceQueueEntry[] = [];
	private templateSelectionsByFileId: Record<string, TemplateSelection> = {};
	private activeFileId: string | null = null;
	private isSliceQueueRunning = false;

	public constructor(
		@ISessionService private readonly sessionService: ISessionServiceType,
		@IUserTemplateService private readonly userTemplateService?: IUserTemplateServiceType,
		@IRawTableRowsReaderService private readonly rawTableRowsReaderService?: IRawTableRowsReaderServiceType,
	) {
		super();
		this._register(this.sessionService.onDidChangeSession(event => {
			if (event.reason === "sessionCleared") {
				this.clearState();
				return;
			}
			if (event.reason === "filesRemoved" && event.fileIds?.length) {
				this.removeFiles(event.fileIds);
			}
		}));
	}

	public getState(): SliceState {
		return {
			fileStates: new Map(this.fileStates),
			queueLength: this.queue.length,
			activeFileId: this.activeFileId,
			templateSelectionsByFileId: { ...this.templateSelectionsByFileId },
		};
	}

	public submit(requests: readonly SliceRequest[]): void {
		let didChange = false;
		for (const request of requests) {
			const plan = this.createRequestPlan(request);
			if (!plan) {
				didChange = this.setFileState(request.ref.fileId, {
					state: "skipped",
					code: "slice.requestInvalid",
					message: "The slice request is no longer valid.",
				}) || didChange;
				continue;
			}

			if (request.trigger.kind === "reviewDecision" && this.isLatestAutoRunCurrent(request.ref, plan)) {
				didChange = this.setFileState(request.ref.fileId, { state: "ready" }) || didChange;
				continue;
			}

			this.enqueueSliceEntry({ ref: request.ref, plan });
			didChange = this.setFileState(request.ref.fileId, { state: "queued" }) || didChange;
		}
		if (didChange) {
			this.fireSliceStateChange();
		}
		this.startSliceQueue();
	}

	public enqueueAuto(refs: readonly RawTableRef[]): void {
		let didChange = false;
		for (const ref of uniqueRawTableRefs(refs)) {
			const request = this.createAutoRequest(ref);
			const plan = request ? this.createRequestPlan(request) : null;
			if (!plan) {
				didChange = this.setFileState(ref.fileId, {
					state: "skipped",
					code: "slice.reviewDecisionMissing",
					message: "No reviewed template is available for automatic slicing.",
				}) || didChange;
				continue;
			}

			if (this.isLatestAutoRunCurrent(ref, plan)) {
				didChange = this.setFileState(ref.fileId, { state: "ready" }) || didChange;
				continue;
			}

			this.enqueueSliceEntry({ ref, plan });
			didChange = this.setFileState(ref.fileId, { state: "queued" }) || didChange;
		}
		if (didChange) {
			this.fireSliceStateChange();
		}
		this.startSliceQueue();
	}

	public runWithTemplate(input: RunSliceWithTemplateInput): void {
		const normalizedRef = normalizeRawTableRef(input.ref);
		if (!normalizedRef) {
			return;
		}

		this.setTemplateSelection(normalizedRef.fileId, input.selection);
		const plan = this.createManualPlan(normalizedRef, input.selection);
		if (!plan) {
			if (this.setFileState(normalizedRef.fileId, {
				state: "skipped",
				code: "slice.templateUnavailable",
				message: "The selected template could not be resolved for slicing.",
			})) {
				this.fireSliceStateChange();
			}
			return;
		}

		this.enqueueSliceEntry({ ref: normalizedRef, plan });
		if (this.setFileState(normalizedRef.fileId, { state: "queued" })) {
			this.fireSliceStateChange();
		}
		this.startSliceQueue();
	}

	public prioritize(fileId: string): void {
		const normalizedFileId = normalizeText(fileId);
		if (!normalizedFileId) {
			return;
		}

		this.activeFileId = normalizedFileId;
		const index = this.queue.findIndex(entry => entry.ref.fileId === normalizedFileId);
		if (index > 0) {
			const [entry] = this.queue.splice(index, 1);
			if (entry) {
				this.queue.unshift(entry);
			}
		}
		this.fireSliceStateChange();
	}

	public cancel(fileIds?: readonly string[]): void {
		const normalizedFileIds = new Set((fileIds ?? []).map(normalizeText).filter(Boolean));
		const cancelAll = !normalizedFileIds.size;
		let didChange = false;
		for (let index = this.queue.length - 1; index >= 0; index -= 1) {
			const entry = this.queue[index];
			if (!entry || (!cancelAll && !normalizedFileIds.has(entry.ref.fileId))) {
				continue;
			}
			this.queue.splice(index, 1);
			didChange = this.setFileState(entry.ref.fileId, { state: "none" }) || didChange;
		}
		if (cancelAll) {
			didChange = this.fileStates.size > 0 || didChange;
			this.fileStates.clear();
			this.activeFileId = null;
		}
		if (didChange) {
			this.fireSliceStateChange();
		}
	}

	public setTemplateSelection(fileId: string, selection: TemplateSelection): void {
		const normalizedFileId = normalizeText(fileId);
		if (!normalizedFileId) {
			return;
		}

		this.templateSelectionsByFileId = {
			...this.templateSelectionsByFileId,
			[normalizedFileId]: normalizeTemplateSelection(selection),
		};
		this.fireSliceStateChange();
	}

	private createAutoPlan(ref: RawTableRef): SlicePlan | null {
		const request = this.createAutoRequest(ref);
		return request ? this.createRequestPlan(request) : null;
	}

	private createAutoRequest(ref: RawTableRef): SliceRequest | null {
		const snapshot = this.sessionService.getSnapshot();
		const file = snapshot.filesById[ref.fileId];
		const tableModel = file?.tableModelByRawTableId[ref.rawTableId];
		const table = file?.raw.tablesById[ref.rawTableId];
		const review = file?.rawTableReviewsByRawTableId?.[ref.rawTableId];
		if (!file || !tableModel || !table || !isSystemRecommendedReview(review)) {
			return null;
		}
		const reviewedTemplate = review.decision.reviewedTemplate;
		const reviewSignature = createReviewRecordSignature(review);
		const requestSignature = createAutomaticSliceRequestSignature({
			reviewSignature,
			sourceRawTableVersion: tableModel.sourceRawTableVersion,
			templateFingerprint: reviewedTemplate.templateFingerprint,
		});
		return {
			id: `slice-request:${ref.fileId}:${ref.rawTableId}:${requestSignature}`,
			ref,
			sourceRawTableVersion: tableModel.sourceRawTableVersion,
			reviewedTemplate,
			trigger: {
				kind: "reviewDecision",
				reviewSignature,
				submittedBy: "system",
			},
			requestSignature,
			createdAt: Date.now(),
		};
	}

	private createRequestPlan(request: SliceRequest): SlicePlan | null {
		const snapshot = this.sessionService.getSnapshot();
		const file = snapshot.filesById[request.ref.fileId];
		const tableModel = file?.tableModelByRawTableId[request.ref.rawTableId];
		const table = file?.raw.tablesById[request.ref.rawTableId];
		if (!file || !tableModel || !table) {
			return null;
		}
		if ((file.rawTableVersionsById[request.ref.rawTableId] ?? 0) !== request.sourceRawTableVersion) {
			return null;
		}

		return this.createPlan({
			file,
			mode: request.trigger.kind === "reviewDecision" ? "auto" : "manual",
			ref: request.ref,
			selection: request.trigger.kind === "reviewDecision"
				? { kind: "auto" }
				: { kind: "inline", template: request.reviewedTemplate.template },
			sourceTableModelSignature: createSliceTableModelSignature(tableModel, {
				reviewSignature: request.trigger.kind === "reviewDecision"
					? request.trigger.reviewSignature
					: request.requestSignature,
			}),
			measurement: getSliceMeasurementBinding(tableModel),
			template: request.reviewedTemplate.template,
			templateFingerprint: request.reviewedTemplate.templateFingerprint,
		});
	}

	private createManualPlan(ref: RawTableRef, selection: TemplateSelection): SlicePlan | null {
		const snapshot = this.sessionService.getSnapshot();
		const file = snapshot.filesById[ref.fileId];
		const template = this.resolveTemplate(selection);
		if (!file || !template) {
			return null;
		}

		return this.createPlan({
			file,
			mode: "manual",
			ref,
			selection,
			measurement: getSliceMeasurementBinding(file.tableModelByRawTableId[ref.rawTableId]),
			template,
		});
	}

	private createPlan({
		file,
		measurement,
		mode,
		ref,
		selection,
		sourceTableModelSignature,
		template,
		templateFingerprint,
	}: {
		readonly file: FileRecord;
		readonly measurement?: SliceMeasurementBinding;
		readonly mode: SlicePlan["mode"];
		readonly ref: RawTableRef;
		readonly selection: TemplateSelection;
		readonly sourceTableModelSignature?: string;
		readonly template: Template;
		readonly templateFingerprint?: string;
	}): SlicePlan | null {
		const table = file.raw.tablesById[ref.rawTableId];
		if (!table) {
			return null;
		}

		const plan = createSlicePlan({
			ref,
			mode,
			selection,
			sourceRawTableVersion: file.rawTableVersionsById[ref.rawTableId] ?? 0,
			sourceTableModelSignature,
			measurement,
			template,
			templateFingerprint,
			rowCount: table.rowCount,
			columnCount: table.columnCount,
		});
		return plan.errors.length ? null : plan;
	}

	private startSliceQueue(): void {
		if (!this.rawTableRowsReaderService || this.isSliceQueueRunning) {
			return;
		}

		void this.drainSliceQueue();
	}

	private enqueueSliceEntry(entry: SliceQueueEntry): void {
		const index = this.queue.findIndex(candidate => sameRawTableRef(candidate.ref, entry.ref));
		if (index === -1) {
			this.queue.push(entry);
			return;
		}

		this.queue[index] = entry;
	}

	private async drainSliceQueue(): Promise<void> {
		if (!this.rawTableRowsReaderService || this.isSliceQueueRunning) {
			return;
		}

		this.isSliceQueueRunning = true;
		try {
			while (this.queue.length) {
				const entry = this.queue.shift();
				if (!entry) {
					continue;
				}

				this.setFileState(entry.ref.fileId, { state: "processing" });
				this.fireSliceStateChange();

				if (!this.isCurrentSlicePlan(entry.plan)) {
					this.dropStaleSliceEntry(entry);
					continue;
				}

				const rows = await this.readRowsForPlan(entry.plan);
				if (!rows) {
					this.setFileState(entry.ref.fileId, {
						state: "failed",
						code: "slice.rowsUnavailable",
						message: "Raw table rows are unavailable for slicing.",
					});
					this.fireSliceStateChange();
					continue;
				}
				if (!this.isCurrentSlicePlan(entry.plan)) {
					this.dropStaleSliceEntry(entry);
					continue;
				}

				const commit = executeSlicePlan({
					plan: entry.plan,
					rows,
				});
				this.sessionService.commitSliceRuns([commit]);
				this.setFileState(entry.ref.fileId, commit.run.errors.length
					? {
						state: "failed",
						code: commit.run.errors[0] ?? "slice.failed",
						message: "Slice failed.",
					}
					: { state: "ready" });
				this.fireSliceStateChange();
			}
		} finally {
			this.isSliceQueueRunning = false;
			if (this.rawTableRowsReaderService && this.queue.length) {
				this.startSliceQueue();
			}
		}
	}

	private isCurrentSlicePlan(plan: SlicePlan): boolean {
		const snapshot = this.sessionService.getSnapshot();
		const file = snapshot.filesById[plan.ref.fileId];
		if (!file?.raw.tablesById[plan.ref.rawTableId]) {
			return false;
		}
		if ((file.rawTableVersionsById[plan.ref.rawTableId] ?? 0) !== plan.sourceRawTableVersion) {
			return false;
		}

		if (plan.mode === "auto") {
			const currentPlan = this.createAutoPlan(plan.ref);
			return Boolean(
				currentPlan &&
					currentPlan.sourceTableModelSignature === plan.sourceTableModelSignature &&
					currentPlan.templateFingerprint === plan.templateFingerprint,
			);
		}

		if (plan.selection.kind === "saved") {
			const currentTemplate = this.resolveTemplate(plan.selection);
			return Boolean(
				currentTemplate &&
					createTemplateFingerprint(currentTemplate) === plan.templateFingerprint,
			);
		}

		return true;
	}

	private dropStaleSliceEntry(entry: SliceQueueEntry): void {
		if (this.queue.some(candidate => candidate.ref.fileId === entry.ref.fileId)) {
			this.setFileState(entry.ref.fileId, { state: "queued" });
		} else {
			this.fileStates.delete(entry.ref.fileId);
		}
		this.fireSliceStateChange();
	}

	private async readRowsForPlan(
		plan: SlicePlan,
	): Promise<readonly (readonly unknown[])[] | null> {
		const snapshot = this.sessionService.getSnapshot();
		const file = snapshot.filesById[plan.ref.fileId];
		const table = file?.raw.tablesById[plan.ref.rawTableId];
		if (!file || !table || !this.rawTableRowsReaderService) {
			return null;
		}

		return this.rawTableRowsReaderService.readRawTableRows({
			fallbackFile: file.raw.file,
			fileName: file.raw.fileName,
			lastModified: file.raw.lastModified ?? null,
			rowStore: toRawTableRowsStore(table),
		});
	}

	private resolveTemplate(selection: TemplateSelection): Template | null {
		if (selection.kind === "inline") {
			return selection.template;
		}
		const templateId = getTemplateSelectionTemplateId(selection);
		if (!templateId || !this.userTemplateService) {
			return null;
		}

		return this.userTemplateService.getTemplate(templateId)?.template ?? null;
	}

	private isLatestAutoRunCurrent(ref: RawTableRef, plan: SlicePlan): boolean {
		const snapshot = this.sessionService.getSnapshot();
		const file = snapshot.filesById[ref.fileId];
		const run = file?.latestSliceRunId ? file.sliceRunsById?.[file.latestSliceRunId] : undefined;
		return Boolean(
			run &&
				run.mode === "auto" &&
				run.rawTableId === ref.rawTableId &&
				run.sourceRawTableVersion === plan.sourceRawTableVersion &&
				run.sourceTableModelSignature === plan.sourceTableModelSignature &&
				run.templateFingerprint === plan.templateFingerprint &&
				run.errors.length === 0,
		);
	}

	private setFileState(fileId: string, state: SliceFileState): boolean {
		const current = this.fileStates.get(fileId);
		if (isSameSliceFileState(current, state)) {
			return false;
		}

		this.fileStates.set(fileId, state);
		return true;
	}

	private clearState(): void {
		const didChange = this.queue.length > 0 ||
			this.fileStates.size > 0 ||
			Object.keys(this.templateSelectionsByFileId).length > 0 ||
			this.activeFileId !== null;
		this.queue.length = 0;
		this.fileStates.clear();
		this.templateSelectionsByFileId = {};
		this.activeFileId = null;
		if (didChange) {
			this.fireSliceStateChange();
		}
	}

	private removeFiles(fileIds: readonly string[]): void {
		const normalizedFileIds = new Set(fileIds.map(normalizeText).filter(Boolean));
		if (!normalizedFileIds.size) {
			return;
		}

		let didChange = false;
		for (let index = this.queue.length - 1; index >= 0; index -= 1) {
			const entry = this.queue[index];
			if (entry && normalizedFileIds.has(entry.ref.fileId)) {
				this.queue.splice(index, 1);
				didChange = true;
			}
		}
		for (const fileId of normalizedFileIds) {
			didChange = this.fileStates.delete(fileId) || didChange;
			if (this.templateSelectionsByFileId[fileId]) {
				const { [fileId]: _removed, ...remainingSelections } = this.templateSelectionsByFileId;
				this.templateSelectionsByFileId = remainingSelections;
				didChange = true;
			}
			if (this.activeFileId === fileId) {
				this.activeFileId = null;
				didChange = true;
			}
		}
		if (didChange) {
			this.fireSliceStateChange();
		}
	}

	private fireSliceStateChange(): void {
		this.onDidChangeSliceStateEmitter.fire(undefined);
	}
}

const normalizeTemplateSelection = (
	selection: TemplateSelection,
): TemplateSelection => {
	if (selection.kind === "inline" || selection.kind === "auto") {
		return selection;
	}

	return selection.templateId.trim()
		? { kind: "saved", templateId: selection.templateId.trim() }
		: { kind: "auto" };
};

const normalizeRawTableRef = (
	ref: RawTableRef,
): RawTableRef | null => {
	const fileId = normalizeText(ref?.fileId);
	const rawTableId = normalizeText(ref?.rawTableId);
	return fileId && rawTableId ? { fileId, rawTableId } : null;
};

const uniqueRawTableRefs = (
	refs: readonly RawTableRef[],
): RawTableRef[] => {
	const result: RawTableRef[] = [];
	const seen = new Set<string>();
	for (const ref of refs) {
		const normalized = normalizeRawTableRef(ref);
		if (!normalized) {
			continue;
		}
		const key = `${normalized.fileId}\u0000${normalized.rawTableId}`;
		if (seen.has(key)) {
			continue;
		}

		seen.add(key);
		result.push(normalized);
	}
	return result;
};

const sameRawTableRef = (
	left: RawTableRef,
	right: RawTableRef,
): boolean =>
	left.fileId === right.fileId &&
	left.rawTableId === right.rawTableId;

const normalizeText = (value: unknown): string => String(value ?? "").trim();

const createAutomaticSliceRequestSignature = ({
	reviewSignature,
	sourceRawTableVersion,
	templateFingerprint,
}: {
	readonly reviewSignature: string;
	readonly sourceRawTableVersion: number;
	readonly templateFingerprint: string;
}): string => JSON.stringify({
	reviewSignature,
	sourceRawTableVersion,
	templateFingerprint,
});

const isSystemRecommendedReview = (
	review: RawTableReviewRecord | undefined,
): review is RawTableReviewRecord & {
	readonly decision: Extract<RawTableReviewRecord["decision"], { readonly kind: "ready" }>;
} =>
	review?.decision.kind === "ready" &&
	review.decision.application.kind === "systemRecommended";

const isSameSliceFileState = (
	current: SliceFileState | undefined,
	next: SliceFileState,
): boolean =>
	current?.state === next.state &&
	("code" in current ? current.code : undefined) === ("code" in next ? next.code : undefined) &&
	("message" in current ? current.message : undefined) === ("message" in next ? next.message : undefined);

const getSliceMeasurementBinding = (
	tableModel: { readonly blocks?: readonly { readonly family: string; readonly ivMode?: string | null; readonly itMode?: string | null }[] } | undefined,
): SliceMeasurementBinding | undefined => {
	const block = tableModel?.blocks?.find(candidate => isSliceCurveFamily(candidate.family));
	if (!block || !isSliceCurveFamily(block.family)) {
		return undefined;
	}

	return {
		curveFamily: block.family,
		...(block.family === "iv" ? { ivMode: block.ivMode === "output" ? "output" : "transfer" } : {}),
		...(block.family === "it" ? { itMode: normalizeItMode(block.itMode) } : {}),
	};
};

const isSliceCurveFamily = (
	family: string,
): family is SliceMeasurementBinding["curveFamily"] =>
	family === "iv" ||
	family === "cv" ||
	family === "cf" ||
	family === "pv" ||
	family === "it";

const normalizeItMode = (
	mode: string | null | undefined,
): NonNullable<SliceMeasurementBinding["itMode"]> =>
	mode === "stability" ||
	mode === "transient" ||
	mode === "retention" ||
	mode === "biasStress" ||
	mode === "photoResponse"
		? mode
		: "generic";

const toRawTableRowsStore = (
	table: TableRecord,
): Parameters<IRawTableRowsReaderServiceType["readRawTableRows"]>[0]["rowStore"] => {
	if (!table.rowStore) {
		return null;
	}
	if (table.rowStore.kind === "memory") {
		return {
			kind: "memory",
			rows: table.rowStore.rows,
		};
	}

	return {
		kind: "external",
		normalizedCsvPath: table.rowStore.normalizedCsvPath ?? null,
	};
};

registerSingleton(
	ISliceService,
	SliceService as unknown as new (...services: BrandedService[]) => ISliceServiceType,
	InstantiationType.Delayed,
);
