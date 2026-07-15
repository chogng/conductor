/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { IDisposable } from "src/cs/base/common/lifecycle";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type { TemplateSemanticPatches } from "src/cs/workbench/services/settings/common/settings";
import type { TableModelContentSnapshot } from "src/cs/workbench/services/table/common/model";
import type { StructuredContentEvidence } from "src/cs/workbench/services/dataResource/common/structuredContent";

export const IStructuredContentEvidenceService = createDecorator<IStructuredContentEvidenceService>(
	"structuredContentEvidenceService",
);

/** Owns the runtime used by DataResource to produce semantic evidence from physical content. */
export interface IStructuredContentEvidenceService extends IDisposable {
	readonly _serviceBrand: undefined;

	create(
		content: TableModelContentSnapshot,
		patches: TemplateSemanticPatches,
	): Promise<StructuredContentEvidence>;
}
