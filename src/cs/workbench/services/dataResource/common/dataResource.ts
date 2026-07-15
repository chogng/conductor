/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { Event } from "src/cs/base/common/event";
import type { IDisposable } from "src/cs/base/common/lifecycle";
import type { URI } from "src/cs/base/common/uri";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type {
	StructuredContentEvidence,
	StructuredContentGridSnapshot,
} from "src/cs/workbench/services/dataResource/common/structuredContent";

export const IDataResourceService = createDecorator<IDataResourceService>("dataResourceService");

export type DataResourceStructuredContentTarget = {
	readonly resource: URI;
	readonly contentHash?: string | null;
	readonly sheetId?: string | null;
};

export type DataResourceLoadState =
	| {
		readonly state: "idle" | "loading" | "ready";
		readonly message?: string;
	}
	| {
		readonly state: "error";
		readonly message: string;
	};

export type DataResourceStructuredContentSnapshot = {
	readonly columnCount: number;
	readonly content: StructuredContentGridSnapshot;
	readonly contentHash?: string;
	readonly fileName: string;
	readonly resource: URI;
	readonly rowCount: number;
	readonly sheetId?: string;
	readonly sourceModelVersion: number;
	readonly sourceUri: string;
	readonly sourceVersion: number;
	readonly structuredContent: StructuredContentEvidence;
};

export type DataResourceStructuredContentResolution =
	| {
		readonly kind: "ready";
		readonly snapshot: DataResourceStructuredContentSnapshot;
	}
	| {
		readonly kind: "pending";
		readonly loadState: DataResourceLoadState;
	}
	| {
		readonly kind: "loadError";
		readonly loadState: DataResourceLoadState & { readonly state: "error" };
	}
	| {
		readonly kind: "missingSheet";
	}
	| {
		readonly kind: "missingContent";
	};

export interface IDataResourceStructuredContentReference extends IDisposable {
	readonly object: DataResourceStructuredContentResolution;
}

/**
 * Workbench domain owner for URI-backed data resources and structured content
 * snapshots. The service is intentionally below Review/Table/Search/Slice and
 * above platform resource bytes.
 */
export interface IDataResourceService extends IDisposable {
	readonly _serviceBrand: undefined;

	/**
	 * Fires when the structured content for a URI resource may have changed.
	 */
	readonly onDidChangeResource: Event<URI>;

	/**
	 * Returns whether structured content can be resolved for this resource.
	 */
	canHandleResource(resource: URI): boolean;

	/**
	 * Resolves a URI resource to a structured-content reference. Callers must
	 * dispose the returned reference when they no longer need the snapshot.
	 */
	resolveStructuredContent(
		target: DataResourceStructuredContentTarget,
	): Promise<IDataResourceStructuredContentReference>;

	/**
	 * Starts resolving structured content without requiring the caller to hold a
	 * reference.
	 */
	resolve(target: DataResourceStructuredContentTarget): void;
}
