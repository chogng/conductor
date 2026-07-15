/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { getPerformanceNow } from 'src/cs/base/common/performance';
import { stableStringify } from 'src/cs/base/common/objects';
import { bootstrapWebWorker } from 'src/cs/base/common/worker/webWorker';
import { createStructuredContentEvidence } from 'src/cs/workbench/services/dataResource/browser/dataResourceService';
import {
	createSemanticMatcher,
	type SemanticMatcher,
} from 'src/cs/workbench/services/dataResource/common/semanticRules';
import type { StructuredContentEvidence } from 'src/cs/workbench/services/dataResource/common/structuredContent';
import type { TemplateSemanticPatches } from 'src/cs/workbench/services/settings/common/settings';
import type { TableModelContentSnapshot } from 'src/cs/workbench/services/table/common/model';

export type StructuredContentEvidenceWorkerInput = {
	readonly content: TableModelContentSnapshot;
	readonly patches: TemplateSemanticPatches;
};

export type StructuredContentEvidenceWorkerOutput = {
	readonly durationMs: number;
	readonly evidence: StructuredContentEvidence;
};

export interface IStructuredContentEvidenceWorker {
	$createEvidence(
		input: StructuredContentEvidenceWorkerInput,
	): StructuredContentEvidenceWorkerOutput;
}

class StructuredContentEvidenceWorker implements IStructuredContentEvidenceWorker {
	private cachedMatcher: SemanticMatcher | null = null;
	private cachedPatchesSignature = '';

	public $createEvidence(
		input: StructuredContentEvidenceWorkerInput,
	): StructuredContentEvidenceWorkerOutput {
		const startedAt = getPerformanceNow();
		const evidence = createStructuredContentEvidence(
			input.content,
			this.getSemanticMatcher(input.patches),
		);
		return {
			durationMs: getPerformanceNow() - startedAt,
			evidence,
		};
	}

	private getSemanticMatcher(patches: TemplateSemanticPatches): SemanticMatcher {
		const signature = stableStringify(patches);
		if (!this.cachedMatcher || signature !== this.cachedPatchesSignature) {
			this.cachedMatcher = createSemanticMatcher({ patches });
			this.cachedPatchesSignature = signature;
		}
		return this.cachedMatcher;
	}
}

bootstrapWebWorker(() => new StructuredContentEvidenceWorker());
