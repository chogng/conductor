/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { Event } from "src/cs/base/common/event";
import type { IDisposable } from "src/cs/base/common/lifecycle";
import type { URI } from "src/cs/base/common/uri";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type {
	DataResourceContentSnapshot,
	IDataResourceContentReference,
} from "src/cs/workbench/services/dataResource/common/dataResourceContentService";

export const IDataResourceEvidenceContentService =
	createDecorator<IDataResourceEvidenceContentService>("dataResourceEvidenceContentService");

/**
 * Runtime-specific physical input for DataResource evidence production.
 *
 * Browser uses the regular content service. Desktop may replace this with a
 * native/Rust reader that emits numeric column facts plus sparse semantic rows.
 */
export interface IDataResourceEvidenceContentService extends IDisposable {
	readonly _serviceBrand: undefined;
	readonly onDidChangeContent: Event<URI>;

	canHandleResource(resource: URI): boolean;
	createContentReference(resource: URI): Promise<IDataResourceContentReference>;
	get(resource: URI | null | undefined): DataResourceContentSnapshot | undefined;
}
