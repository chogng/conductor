/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type {
	ImportTableFactsSeed,
} from "src/cs/workbench/services/tableFacts/common/tableFacts";
import type {
	ColumnProfile,
} from "src/cs/workbench/services/tableFacts/common/columnProfile";
import type {
	SchemaProfile,
} from "src/cs/workbench/services/schemaProfile/common/schemaProfile";
import {
	createSchemaProfileBackedTableFactsSeed,
} from "src/cs/workbench/services/tableFacts/common/schemaProfileTableFacts";

export {
	createSchemaProfileBackedTableFactsSeed,
};

export const createProfileBackedAssessment = ({
	assessment,
	columnProfiles,
	schemaProfile,
}: {
	readonly assessment: ImportTableFactsSeed;
	readonly columnProfiles: readonly ColumnProfile[];
	readonly schemaProfile: SchemaProfile | null;
}): ImportTableFactsSeed => createSchemaProfileBackedTableFactsSeed({
	tableFactsSeed: assessment,
	columnProfiles,
	schemaProfile,
});
