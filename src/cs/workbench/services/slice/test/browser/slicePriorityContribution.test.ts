/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { Emitter, Event } from "src/cs/base/common/event";
import type { IDisposable } from "src/cs/base/common/lifecycle";
import { URI } from "src/cs/base/common/uri";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import type {
	ExplorerContext,
	ExplorerHoveredFileChangeEvent,
	ExplorerSelectionChangeEvent,
	IExplorerService,
	IExplorerView,
} from "src/cs/workbench/contrib/files/browser/files";
import { SlicePriorityContribution } from "src/cs/workbench/services/slice/browser/slicePriority.contribution";
import type {
	ISliceService,
	SliceState,
	SliceUriRequest,
	SliceUriTarget,
} from "src/cs/workbench/services/slice/common/slice";
import type { TemplateSelection } from "src/cs/workbench/services/slice/common/templateSelection";
import type { ExplorerFileEntry } from "src/cs/workbench/contrib/files/common/explorerModel";

suite("workbench/services/slice/test/browser/slicePriorityContribution", () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test("ignores existing explorer selection and hover without URI targets on startup", () => {
		const explorer = createExplorerService({
			hoveredFileId: " file-hover ",
			selectedProcessedFileId: " file-selected ",
		});
		const sliceService = new TestSliceService();

		store.add(new SlicePriorityContribution(explorer.service, sliceService));

		assert.deepEqual(sliceService.prioritizedUriTargets, []);
		explorer.dispose();
	});

	test("ignores explorer selection and hover events without URI targets", () => {
		const explorer = createExplorerService();
		const sliceService = new TestSliceService();
		store.add(new SlicePriorityContribution(explorer.service, sliceService));

		explorer.fireSelection({ kind: "chart", selectedFileId: " file-a " });
		explorer.fireSelection({ kind: "chart", selectedFileId: " " });
		explorer.fireHoveredFile({ fileId: " file-b " });
		explorer.fireHoveredFile({ fileId: null });

		assert.deepEqual(sliceService.prioritizedUriTargets, []);
		explorer.dispose();
	});

	test("prioritizes URI targets from explorer resource entries", () => {
		const resource = URI.file("/workspace/source.xlsx");
		const explorer = createExplorerService({
			files: [{
				fileId: "source-file",
				fileName: "source.xlsx",
				resource,
				sheetId: "sheet-a",
			}],
			hoveredFileId: "source-file",
			selectedProcessedFileId: "source-file",
		});
		const sliceService = new TestSliceService();

		store.add(new SlicePriorityContribution(explorer.service, sliceService));

		assert.deepEqual(sliceService.prioritizedUriTargets.map(target => ({
			resource: target.resource.toString(),
			sheetId: target.sheetId,
		})), [{
			resource: resource.toString(),
			sheetId: "sheet-a",
		}, {
			resource: resource.toString(),
			sheetId: "sheet-a",
		}]);
		explorer.dispose();
	});
});

class TestSliceService implements ISliceService {
	public declare readonly _serviceBrand: undefined;
	public readonly onDidChangeSliceState = Event.None as Event<void>;
	public readonly onDidChangeUriSliceResult = Event.None as Event<SliceUriTarget>;
	public readonly prioritizedUriTargets: SliceUriTarget[] = [];

	public getState(): SliceState {
		return {
			activeFileId: null,
			fileStates: new Map(),
			queueLength: 0,
			templateSelectionsByFileId: {},
		};
	}

	public getUriResult(): null {
		return null;
	}

	public getUriState(): undefined {
		return undefined;
	}

	public submitUri(_requests: readonly SliceUriRequest[]): void {}

	public prioritizeUri(target: SliceUriTarget): void {
		this.prioritizedUriTargets.push(target);
	}

	public cancel(_fileIds?: readonly string[]): void {}
	public cancelUri(_targets: readonly SliceUriTarget[]): void {}
	public setTemplateSelection(_fileId: string, _selection: TemplateSelection): void {}
}

const createExplorerService = ({
	files = [],
	hoveredFileId = null,
	selectedProcessedFileId = null,
	selectedRawFileId = null,
}: {
	readonly files?: readonly ExplorerFileEntry[];
	readonly hoveredFileId?: string | null;
	readonly selectedProcessedFileId?: string | null;
	readonly selectedRawFileId?: string | null;
} = {}): {
	readonly dispose: () => void;
	readonly fireHoveredFile: (event: ExplorerHoveredFileChangeEvent) => void;
	readonly fireSelection: (event: ExplorerSelectionChangeEvent) => void;
	readonly service: IExplorerService;
} => {
	const onDidChangeHoveredFileEmitter = new Emitter<ExplorerHoveredFileChangeEvent>();
	const onDidChangeSelectionEmitter = new Emitter<ExplorerSelectionChangeEvent>();
	const service: IExplorerService = {
		_serviceBrand: undefined,
		applyBulkEdit: () => Promise.resolve(),
		expandedFolderKeys: [],
		getCollapsedFolderKeys: () => [],
		getContext: () => ({
			editable: null,
			expandedFolderKeys: [],
			hoveredFileId,
			selectedProcessedFileId,
			selectedProcessedItemKey: null,
			selectedRawFileId,
			selectedRawItemKey: null,
			toCopy: {
				isCut: false,
				resources: [],
			},
			viewLayout: "tree",
		}) satisfies ExplorerContext,
		getPaneInput: () => ({
			files: [...files],
			mode: "chart",
			selectedFileId: selectedProcessedFileId,
			selectionKind: "chart",
			thumbnailFiles: [],
		}),
		hasPendingSourceFiles: false,
		hoveredFileId,
		onDidChangeExpandedFolderKeys: Event.None as IExplorerService["onDidChangeExpandedFolderKeys"],
		onDidChangeHoveredFile: onDidChangeHoveredFileEmitter.event,
		onDidChangePaneInput: Event.None as Event<void>,
		onDidChangePendingSourceFiles: Event.None as IExplorerService["onDidChangePendingSourceFiles"],
		onDidChangeSelection: onDidChangeSelectionEmitter.event,
		onDidChangeViewLayout: Event.None as IExplorerService["onDidChangeViewLayout"],
		onDidChangeVisibleFileIds: Event.None as IExplorerService["onDidChangeVisibleFileIds"],
		reconcileExpandedFolderKeys: () => [],
		refresh: () => Promise.resolve(),
		registerView: (_view: IExplorerView): IDisposable => ({ dispose: () => undefined }),
		select: () => null,
		selectedProcessedFileId,
		selectedProcessedItemKey: null,
		selectedRawFileId,
		selectedRawItemKey: null,
		setEditable: () => undefined,
		setExpandedFolderKeys: () => undefined,
		setHoveredFileId: () => undefined,
		setPendingSourceFiles: () => undefined,
		setToCopy: () => undefined,
		setViewLayout: () => undefined,
		setVisibleFileIds: () => undefined,
		toggleViewLayout: () => undefined,
		updatePaneInput: () => undefined,
		viewLayout: "tree",
	};

	return {
		dispose: () => {
			onDidChangeHoveredFileEmitter.dispose();
			onDidChangeSelectionEmitter.dispose();
		},
		fireHoveredFile: event => onDidChangeHoveredFileEmitter.fire(event),
		fireSelection: event => onDidChangeSelectionEmitter.fire(event),
		service,
	};
};
