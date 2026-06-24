/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type {
	FileRecord,
	SheetId,
} from "src/cs/workbench/services/session/common/sessionModel";
import {
	getLatestSliceRunRecord,
} from "src/cs/workbench/services/session/common/sessionModel";
import type {
	SliceFileState,
	SliceRun,
} from "src/cs/workbench/services/slice/common/slice";
import {
	createReviewRecordSignature,
	type RawTableReviewRecord,
} from "src/cs/workbench/services/review/common/review";

export type RawTableExplorerStatus =
	| {
			readonly kind: "none";
		}
	| {
			readonly kind: "reviewPending";
			readonly rawTableId: SheetId;
			readonly sourceRawTableVersion: number;
		}
	| {
			readonly kind: "reviewStale";
			readonly rawTableId: SheetId;
			readonly reviewSourceRawTableVersion: number;
			readonly sourceRawTableVersion: number;
		}
	| {
			readonly kind: "systemRecommended";
			readonly rawTableId: SheetId;
			readonly reviewSignature: string;
			readonly templateFingerprint: string;
		}
	| {
			readonly kind: "userActionRequired";
			readonly rawTableId: SheetId;
			readonly reason: string;
			readonly reviewSignature: string;
			readonly templateFingerprint: string;
		}
	| {
			readonly kind: "needsManualAdjustment";
			readonly rawTableId: SheetId;
			readonly candidateId?: string;
			readonly diagnosticCodes: readonly string[];
			readonly reasons: readonly string[];
		}
	| {
			readonly kind: "invalid";
			readonly rawTableId: SheetId;
			readonly diagnosticCodes: readonly string[];
			readonly reasons: readonly string[];
		}
	| {
			readonly kind: "sliceQueued" | "sliceProcessing";
			readonly rawTableId: SheetId;
			readonly sourceRawTableVersion: number;
		}
	| {
			readonly kind: "sliced";
			readonly rawTableId: SheetId;
			readonly runId: string;
			readonly sourceRawTableVersion: number;
			readonly templateFingerprint: string;
		}
	| {
			readonly kind: "sliceSkipped" | "sliceFailed";
			readonly rawTableId: SheetId;
			readonly code: string;
			readonly message: string;
		};

export type RawTableStatusProjectionInput = {
	readonly file: FileRecord | undefined;
	readonly rawTableId: SheetId | null | undefined;
	readonly sliceFileState?: SliceFileState;
};

export const createRawTableStatusProjection = ({
	file,
	rawTableId,
	sliceFileState,
}: RawTableStatusProjectionInput): RawTableExplorerStatus => {
	const normalizedRawTableId = normalizeId(rawTableId);
	if (!file || !normalizedRawTableId) {
		return { kind: "none" };
	}

	const sourceRawTableVersion = normalizeVersion(file.rawTableVersionsById[normalizedRawTableId]);
	const latestSliceRun = getLatestCurrentRawTableSliceRun({
		file,
		rawTableId: normalizedRawTableId,
		sourceRawTableVersion,
	});
	if (sliceFileState?.state === "queued") {
		return {
			kind: "sliceQueued",
			rawTableId: normalizedRawTableId,
			sourceRawTableVersion,
		};
	}
	if (sliceFileState?.state === "processing") {
		return {
			kind: "sliceProcessing",
			rawTableId: normalizedRawTableId,
			sourceRawTableVersion,
		};
	}
	if (sliceFileState?.state === "skipped") {
		return {
			kind: "sliceSkipped",
			rawTableId: normalizedRawTableId,
			code: sliceFileState.code,
			message: sliceFileState.message,
		};
	}
	if (sliceFileState?.state === "failed") {
		return {
			kind: "sliceFailed",
			rawTableId: normalizedRawTableId,
			code: sliceFileState.code,
			message: sliceFileState.message,
		};
	}
	if (latestSliceRun) {
		return {
			kind: "sliced",
			rawTableId: normalizedRawTableId,
			runId: latestSliceRun.id,
			sourceRawTableVersion,
			templateFingerprint: latestSliceRun.templateFingerprint,
		};
	}

	const review = file.rawTableReviewsByRawTableId?.[normalizedRawTableId];
	if (!review) {
		return {
			kind: "reviewPending",
			rawTableId: normalizedRawTableId,
			sourceRawTableVersion,
		};
	}
	if (review.sourceRawTableVersion !== sourceRawTableVersion) {
		return {
			kind: "reviewStale",
			rawTableId: normalizedRawTableId,
			reviewSourceRawTableVersion: review.sourceRawTableVersion,
			sourceRawTableVersion,
		};
	}

	return createReviewStatusProjection(review);
};

export const createRawTableStatusSignature = (
	status: RawTableExplorerStatus | undefined,
): string => {
	if (!status) {
		return "";
	}
	switch (status.kind) {
		case "none":
			return "none";
		case "reviewPending":
		case "sliceQueued":
		case "sliceProcessing":
			return [
				status.kind,
				status.rawTableId,
				status.sourceRawTableVersion,
			].join("\u001f");
		case "reviewStale":
			return [
				status.kind,
				status.rawTableId,
				status.reviewSourceRawTableVersion,
				status.sourceRawTableVersion,
			].join("\u001f");
		case "systemRecommended":
			return [
				status.kind,
				status.rawTableId,
				status.reviewSignature,
				status.templateFingerprint,
			].join("\u001f");
		case "userActionRequired":
			return [
				status.kind,
				status.rawTableId,
				status.reason,
				status.reviewSignature,
				status.templateFingerprint,
			].join("\u001f");
		case "needsManualAdjustment":
			return [
				status.kind,
				status.rawTableId,
				status.candidateId ?? "",
				status.reasons.join("\u001d"),
				status.diagnosticCodes.join("\u001d"),
			].join("\u001f");
		case "invalid":
			return [
				status.kind,
				status.rawTableId,
				status.reasons.join("\u001d"),
				status.diagnosticCodes.join("\u001d"),
			].join("\u001f");
		case "sliced":
			return [
				status.kind,
				status.rawTableId,
				status.runId,
				status.sourceRawTableVersion,
				status.templateFingerprint,
			].join("\u001f");
		case "sliceSkipped":
		case "sliceFailed":
			return [
				status.kind,
				status.rawTableId,
				status.code,
				status.message,
			].join("\u001f");
	}
};

const createReviewStatusProjection = (
	review: RawTableReviewRecord,
): RawTableExplorerStatus => {
	const reviewSignature = createReviewRecordSignature(review);
	const decision = review.decision;
	if (decision.kind === "ready") {
		if (decision.application.kind === "systemRecommended") {
			return {
				kind: "systemRecommended",
				rawTableId: review.rawTableId,
				reviewSignature,
				templateFingerprint: decision.reviewedTemplate.templateFingerprint,
			};
		}

		return {
			kind: "userActionRequired",
			rawTableId: review.rawTableId,
			reason: decision.application.reason,
			reviewSignature,
			templateFingerprint: decision.reviewedTemplate.templateFingerprint,
		};
	}

	if (decision.kind === "needsManualAdjustment") {
		return {
			kind: "needsManualAdjustment",
			rawTableId: review.rawTableId,
			...(decision.candidateId ? { candidateId: decision.candidateId } : {}),
			diagnosticCodes: decision.diagnostics.map(diagnostic => diagnostic.code),
			reasons: decision.reasons,
		};
	}

	return {
		kind: "invalid",
		rawTableId: review.rawTableId,
		diagnosticCodes: decision.diagnostics.map(diagnostic => diagnostic.code),
		reasons: decision.reasons,
	};
};

const getLatestCurrentRawTableSliceRun = ({
	file,
	rawTableId,
	sourceRawTableVersion,
}: {
	readonly file: FileRecord;
	readonly rawTableId: SheetId;
	readonly sourceRawTableVersion: number;
}): SliceRun | undefined => {
	const latestFileRun = getLatestSliceRunRecord(file);
	if (isCurrentRawTableSliceRun(latestFileRun, rawTableId, sourceRawTableVersion)) {
		return latestFileRun;
	}

	const runs = Object.values(file.sliceRunsById ?? {});
	for (let index = runs.length - 1; index >= 0; index -= 1) {
		const run = runs[index];
		if (isCurrentRawTableSliceRun(run, rawTableId, sourceRawTableVersion)) {
			return run;
		}
	}

	return undefined;
};

const isCurrentRawTableSliceRun = (
	run: SliceRun | undefined,
	rawTableId: SheetId,
	sourceRawTableVersion: number,
): run is SliceRun =>
	run?.rawTableId === rawTableId &&
	run.sourceRawTableVersion === sourceRawTableVersion;

const normalizeId = (
	value: unknown,
): string | null => {
	const normalized = String(value ?? "").trim();
	return normalized || null;
};

const normalizeVersion = (
	value: unknown,
): number => {
	const version = Math.floor(Number(value));
	return Number.isFinite(version) && version >= 0 ? version : 0;
};
