/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { SessionFile } from "src/cs/workbench/services/session/common/sessionTypes";
import type { ProcessingQueueItem } from "src/cs/workbench/services/template/browser/templateApplyProcessing";
import {
	createTemplateProcessingAssessment,
} from "src/cs/workbench/services/template/common/templateProcessingAssessment";

/**
 * Builds the template application queue from raw session files.
 */
export function buildTemplateProcessingQueue(
	rawFiles: readonly SessionFile[],
	processedIds: ReadonlySet<string> | null = null,
): ProcessingQueueItem[] {
	const queue: ProcessingQueueItem[] = [];
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
		queue.push({
			...(assessment ? { assessment } : {}),
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

	return queue;
}
