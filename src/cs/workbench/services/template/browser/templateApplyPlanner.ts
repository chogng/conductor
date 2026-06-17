/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { SessionFile } from "src/cs/workbench/services/session/common/sessionTypes";
import type { ProcessingQueueItem } from "src/cs/workbench/services/template/browser/templateApplyProcessing";
import {
	createTemplateProcessingAssessment,
	type TemplateProcessingAssessment,
} from "src/cs/workbench/services/template/common/templateProcessingAssessment";

export type TemplateProcessingSkipReason =
	| "invalidSource"
	| "missingAssessment"
	| "needsTemplate"
	| "lowConfidence"
	| "unknownCurveType"
	| "noMatchingRule";

export type TemplateProcessingSkippedFile = {
	readonly fileId: string;
	readonly fileName?: string;
	readonly reason: TemplateProcessingSkipReason;
};

export type TemplateProcessingPlan = {
	readonly queue: ProcessingQueueItem[];
	readonly skippedFiles: readonly TemplateProcessingSkippedFile[];
};

export type TemplateProcessingPlanMode = "auto" | "manual" | "rule";

export type TemplateProcessingPlanOptions = {
	readonly mode?: TemplateProcessingPlanMode;
	readonly priorityFileId?: string | null;
};

/**
 * Builds the template application queue from raw session files.
 */
export function buildTemplateProcessingQueue(
	rawFiles: readonly SessionFile[],
	processedIds: ReadonlySet<string> | null = null,
	options: TemplateProcessingPlanOptions = {},
): ProcessingQueueItem[] {
	return buildTemplateProcessingPlan(rawFiles, processedIds, options).queue;
}

export function buildTemplateProcessingPlan(
	rawFiles: readonly SessionFile[],
	processedIds: ReadonlySet<string> | null = null,
	options: TemplateProcessingPlanOptions = {},
): TemplateProcessingPlan {
	const queue: ProcessingQueueItem[] = [];
	const skippedFiles: TemplateProcessingSkippedFile[] = [];
	const queuedIds = new Set<string>();
	const mode = options.mode ?? "auto";

	for (const entry of Array.isArray(rawFiles) ? rawFiles : []) {
		const fileId = String(entry?.fileId ?? "").trim();
		if (!fileId) {
			continue;
		}
		if (processedIds?.has(fileId) || queuedIds.has(fileId)) {
			continue;
		}

		if (!hasTemplateProcessingSource(entry)) {
			skippedFiles.push({
				fileId,
				fileName: entry.fileName,
				reason: "invalidSource",
			});
			queuedIds.add(fileId);
			continue;
		}

		if (entry.templateEligibility === "notEligible" || isInvalidSourceHealth(entry.assessmentHealth)) {
			skippedFiles.push({
				fileId,
				fileName: entry.fileName,
				reason: "invalidSource",
			});
			queuedIds.add(fileId);
			continue;
		}

		const assessment = createTemplateProcessingAssessment(entry);
		if (mode === "auto") {
			const skipReason = getTemplateProcessingSkipReason(assessment);
			if (skipReason) {
				skippedFiles.push({
					fileId,
					fileName: entry.fileName,
					reason: skipReason,
				});
				queuedIds.add(fileId);
				continue;
			}
		}

		queue.push({
			assessment,
			file: entry.file,
			fileId,
			fileName: entry.fileName,
			normalizedCsvPath:
				typeof entry.normalizedCsvPath === "string"
					? entry.normalizedCsvPath
					: null,
			sourcePath:
				typeof entry.sourcePath === "string" ? entry.sourcePath : null,
		});
		queuedIds.add(fileId);
	}

	return {
		queue: prioritizeTemplateProcessingQueue(queue, options.priorityFileId),
		skippedFiles,
	};
}

export function prioritizeTemplateProcessingQueue<T extends { readonly fileId?: string | null }>(
	queue: readonly T[],
	priorityFileId?: string | null,
): T[] {
	const normalizedPriorityFileId = normalizeFileId(priorityFileId);
	if (!normalizedPriorityFileId) {
		return [...queue];
	}

	const priorityIndex = queue.findIndex(
		entry => normalizeFileId(entry.fileId) === normalizedPriorityFileId,
	);
	if (priorityIndex <= 0) {
		return [...queue];
	}

	return [
		queue[priorityIndex],
		...queue.slice(0, priorityIndex),
		...queue.slice(priorityIndex + 1),
	];
}

const normalizeFileId = (fileId: string | null | undefined): string => String(fileId ?? "").trim();

const hasTemplateProcessingSource = (entry: SessionFile): boolean =>
	entry.file !== undefined ||
	hasNonEmptyText(entry.normalizedCsvPath) ||
	hasCsvSourcePath(entry.sourcePath);

const hasNonEmptyText = (value: unknown): boolean =>
	typeof value === "string" && value.trim().length > 0;

const hasCsvSourcePath = (value: unknown): boolean =>
	typeof value === "string" && value.trim().toLowerCase().endsWith(".csv");

const getTemplateProcessingSkipReason = (
	assessment: TemplateProcessingAssessment | null,
): TemplateProcessingSkipReason | null => {
	if (!assessment) {
		return "missingAssessment";
	}
	if (assessment.curveTypeNeedsTemplate === true) {
		return "needsTemplate";
	}

	const curveType = normalizeProcessableCurveType(assessment);
	if (!curveType) {
		return "unknownCurveType";
	}
	if (assessment.curveTypeConfidence === "low") {
		return "lowConfidence";
	}
	if (!assessment.curveTypeConfidence) {
		return "missingAssessment";
	}

	return null;
};

const isInvalidSourceHealth = (
	health: SessionFile["assessmentHealth"],
): boolean =>
	health === "decodeFailed" ||
	health === "parseFailed" ||
	health === "unsupported";

const normalizeProcessableCurveType = (
	assessment: TemplateProcessingAssessment,
): "transfer" | "output" | "cv" | "cf" | "pv" | null => {
	const text = String(assessment.curveType ?? "")
		.trim()
		.toLowerCase()
		.replace(/\s*\([^)]*\)\s*$/, "")
		.trim();
	switch (text) {
		case "transfer":
		case "output":
		case "cv":
		case "cf":
		case "pv":
			return text;
		case "iv":
			return assessment.xAxisRole === "vg"
				? "transfer"
				: assessment.xAxisRole === "vd"
					? "output"
					: null;
		default:
			return null;
	}
};
