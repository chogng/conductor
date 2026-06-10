/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type {
	ExplorerSelectionKind,
	ExplorerSelectionRemoval,
	ExplorerSelectionRequest,
} from "src/cs/workbench/services/explorer/common/explorer";

/**
 * Stores Explorer-owned resource selection and applies candidate/removal rules.
 */
export class ExplorerSelectionStore {
	private currentRawFileId: string | null = null;
	private currentProcessedFileId: string | null = null;

	public getSelectedFileId(kind: ExplorerSelectionKind): string | null {
		return kind === "raw"
			? this.currentRawFileId
			: this.currentProcessedFileId;
	}

	public setSelection(selection: ExplorerSelectionRequest): {
		readonly changed: boolean;
		readonly selectedFileId: string | null;
	} {
		const nextFileId = normalizeExplorerFileId(selection.selectedFileId);
		if (nextFileId && selection.candidateFileIds) {
			const candidates = getNormalizedExplorerFileIds(selection.candidateFileIds);
			if (!candidates.includes(nextFileId)) {
				return {
					changed: false,
					selectedFileId: this.getSelectedFileId(selection.kind),
				};
			}
		}

		return this.setSelectedFileId(selection.kind, nextFileId);
	}

	public clearSelection(kind: ExplorerSelectionKind): {
		readonly changed: boolean;
		readonly selectedFileId: string | null;
	} {
		return this.setSelectedFileId(kind, null);
	}

	public removeFileIdsFromSelection(selection: ExplorerSelectionRemoval): {
		readonly changed: boolean;
		readonly selectedFileId: string | null;
	} {
		const removedFileIds = new Set(getNormalizedExplorerFileIds(selection.removedFileIds));
		const remainingFileIds = getNormalizedExplorerFileIds(selection.remainingFileIds)
			.filter(fileId => !removedFileIds.has(fileId));
		const currentFileId = this.getSelectedFileId(selection.kind);
		const nextFileId = !currentFileId
			? null
			: removedFileIds.has(currentFileId)
				? remainingFileIds[0] ?? null
				: resolveSelectedExplorerFileId(currentFileId, remainingFileIds);

		return this.setSelectedFileId(selection.kind, nextFileId);
	}

	public resolveSelectedFileId(kind: ExplorerSelectionKind, fileIds: readonly string[]): string | null {
		return resolveSelectedExplorerFileId(this.getSelectedFileId(kind), fileIds);
	}

	public reconcileSelection(kind: ExplorerSelectionKind, fileIds: readonly string[]): {
		readonly changed: boolean;
		readonly selectedFileId: string | null;
	} {
		return this.setSelectedFileId(
			kind,
			resolveSelectedExplorerFileId(this.getSelectedFileId(kind), fileIds),
		);
	}

	public normalizeFileId(fileId: unknown): string | null {
		return normalizeExplorerFileId(fileId);
	}

	private setSelectedFileId(kind: ExplorerSelectionKind, fileId: string | null): {
		readonly changed: boolean;
		readonly selectedFileId: string | null;
	} {
		const nextFileId = normalizeExplorerFileId(fileId);
		const currentFileId = this.getSelectedFileId(kind);
		if (currentFileId === nextFileId) {
			return {
				changed: false,
				selectedFileId: nextFileId,
			};
		}

		if (kind === "raw") {
			this.currentRawFileId = nextFileId;
		} else {
			this.currentProcessedFileId = nextFileId;
		}

		return {
			changed: true,
			selectedFileId: nextFileId,
		};
	}
}

const resolveSelectedExplorerFileId = (
	selectedFileId: string | null,
	fileIds: readonly string[],
): string | null => {
	const candidates = getNormalizedExplorerFileIds(fileIds);
	if (selectedFileId && candidates.includes(selectedFileId)) {
		return selectedFileId;
	}

	return candidates[0] ?? null;
};

const getNormalizedExplorerFileIds = (
	fileIds: readonly string[],
): readonly string[] => {
	const result: string[] = [];
	const seen = new Set<string>();
	for (const fileId of fileIds) {
		const normalized = normalizeExplorerFileId(fileId);
		if (!normalized || seen.has(normalized)) {
			continue;
		}

		seen.add(normalized);
		result.push(normalized);
	}

	return result;
};

const normalizeExplorerFileId = (fileId: unknown): string | null => {
	const normalized = String(fileId ?? "").trim();
	return normalized || null;
};
