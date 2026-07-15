/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { getPerformanceNow } from "src/cs/base/common/performance";
import { stableStringify } from "src/cs/base/common/objects";
import { createStructuredContentEvidence } from "src/cs/workbench/services/dataResource/browser/dataResourceService";
import {
	createSemanticMatcher,
	type SemanticMatcher,
} from "src/cs/workbench/services/dataResource/common/semanticRules";
import type { StructuredContentEvidence } from "src/cs/workbench/services/dataResource/common/structuredContent";
import type { TemplateSemanticPatches } from "src/cs/workbench/services/settings/common/settings";
import type { TableModelContentSnapshot } from "src/cs/workbench/services/table/common/model";

export type StructuredContentEvidenceWorkerRequest = {
	readonly payload: {
		readonly content: TableModelContentSnapshot;
		readonly patches: TemplateSemanticPatches;
		readonly requestId: number;
	};
	readonly type: "createEvidence";
};

export type StructuredContentEvidenceWorkerResult = {
	readonly payload: {
		readonly durationMs: number;
		readonly evidence: StructuredContentEvidence;
		readonly requestId: number;
	};
	readonly type: "createEvidenceResult";
};

export type StructuredContentEvidenceWorkerError = {
	readonly payload: {
		readonly message: string;
		readonly requestId: number;
	};
	readonly type: "workerError";
};

export type StructuredContentEvidenceWorkerMessage =
	| StructuredContentEvidenceWorkerResult
	| StructuredContentEvidenceWorkerError;

let cachedMatcher: SemanticMatcher | null = null;
let cachedPatchesSignature = "";

self.onmessage = async (
	event: MessageEvent<StructuredContentEvidenceWorkerRequest>,
): Promise<void> => {
	const message = event.data;
	if (message?.type !== "createEvidence") {
		return;
	}

	const startedAt = getPerformanceNow();
	try {
		const evidence = createStructuredContentEvidence(
			message.payload.content,
			getSemanticMatcher(message.payload.patches),
		);
		self.postMessage({
			payload: {
				durationMs: getPerformanceNow() - startedAt,
				evidence,
				requestId: message.payload.requestId,
			},
			type: "createEvidenceResult",
		} satisfies StructuredContentEvidenceWorkerResult);
	} catch (error) {
		self.postMessage({
			payload: {
				message: getErrorMessage(error),
				requestId: message.payload.requestId,
			},
			type: "workerError",
		} satisfies StructuredContentEvidenceWorkerError);
	}
};

const getSemanticMatcher = (patches: TemplateSemanticPatches): SemanticMatcher => {
	const signature = stableStringify(patches);
	if (!cachedMatcher || signature !== cachedPatchesSignature) {
		cachedMatcher = createSemanticMatcher({ patches });
		cachedPatchesSignature = signature;
	}
	return cachedMatcher;
};

const getErrorMessage = (error: unknown): string =>
	error instanceof Error && error.message.trim()
		? error.message
		: "The DataResource evidence worker failed.";
