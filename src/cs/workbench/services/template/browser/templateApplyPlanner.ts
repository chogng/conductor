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
	| "missingAssessment"
	| "needsTemplate"
	| "lowConfidence"
	| "unknownCurveType";

export type TemplateProcessingSkippedFile = {
	readonly fileId: string;
	readonly fileName?: string;
	readonly reason: TemplateProcessingSkipReason;
};

export type TemplateProcessingPlan = {
	readonly queue: ProcessingQueueItem[];
	readonly skippedFiles: readonly TemplateProcessingSkippedFile[];
};

/**
 * Builds the template application queue from raw session files.
 */
export function buildTemplateProcessingQueue(
	rawFiles: readonly SessionFile[],
	processedIds: ReadonlySet<string> | null = null,
): ProcessingQueueItem[] {
	return buildTemplateProcessingPlan(rawFiles, processedIds).queue;
}

export function buildTemplateProcessingPlan(
	rawFiles: readonly SessionFile[],
	processedIds: ReadonlySet<string> | null = null,
): TemplateProcessingPlan {
	const queue: ProcessingQueueItem[] = [];
	const skippedFiles: TemplateProcessingSkippedFile[] = [];
	const queuedIds = new Set<string>();

	for (const entry of Array.isArray(rawFiles) ? rawFiles : []) {
		const fileId = String(entry?.fileId ?? "").trim();
		if (!entry?.file || !fileId) {
			continue;
		}
		if (processedIds?.has(fileId) || queuedIds.has(fileId)) {
			continue;
		}

		const assessment = createTemplateProcessingAssessment(entry);
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
		queue,
		skippedFiles,
	};
}

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
