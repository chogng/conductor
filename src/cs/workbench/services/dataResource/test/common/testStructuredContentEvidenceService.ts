/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { createStructuredContentEvidence } from "src/cs/workbench/services/dataResource/browser/dataResourceService";
import { createSemanticMatcher } from "src/cs/workbench/services/dataResource/common/semanticRules";
import type { IStructuredContentEvidenceService } from "src/cs/workbench/services/dataResource/common/structuredContentEvidenceService";

export const testStructuredContentEvidenceService: IStructuredContentEvidenceService = {
	_serviceBrand: undefined,
	create: async (content, patches) => createStructuredContentEvidence(
		content,
		createSemanticMatcher({ patches }),
	),
	dispose: () => undefined,
};
