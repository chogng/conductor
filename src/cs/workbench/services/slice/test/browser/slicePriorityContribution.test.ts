/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { Emitter, Event } from "src/cs/base/common/event";
import type { IDisposable } from "src/cs/base/common/lifecycle";
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
	RunSliceWithTemplateInput,
	SliceRequest,
	SliceState,
} from "src/cs/workbench/services/slice/common/slice";
import type { RawTableRef } from "src/cs/workbench/services/session/common/sessionModel";
import type { TemplateSelection } from "src/cs/workbench/services/slice/common/templateSelection";

suite("workbench/services/slice/test/browser/slicePriorityContribution", () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test("prioritizes existing explorer selection and hover on startup", () => {
		const explorer = createExplorerService({
			hoveredFileId: " file-hover ",
			selectedProcessedFileId: " file-selected ",
		});
		const sliceService = new TestSliceService();

		store.add(new SlicePriorityContribution(explorer.service, sliceService));

		assert.deepEqual(sliceService.prioritizedFileIds, ["file-selected", "file-hover"]);
		explorer.dispose();
	});

	test("prioritizes explorer selection and hover events", () => {
		const explorer = createExplorerService();
		const sliceService = new TestSliceService();
		store.add(new SlicePriorityContribution(explorer.service, sliceService));

		explorer.fireSelection({ kind: "chart", selectedFileId: " file-a " });
		explorer.fireSelection({ kind: "chart", selectedFileId: " " });
		explorer.fireHoveredFile({ fileId: " file-b " });
		explorer.fireHoveredFile({ fileId: null });

		assert.deepEqual(sliceService.prioritizedFileIds, ["file-a", "file-b"]);
		explorer.dispose();
	});
});

class TestSliceService implements ISliceService {
	public declare readonly _serviceBrand: undefined;
	public readonly onDidChangeSliceState = Event.None as Event<void>;
	public readonly prioritizedFileIds: string[] = [];

	public getState(): SliceState {
		return {
			activeFileId: null,
			fileStates: new Map(),
			queueLength: 0,
			templateSelectionsByFileId: {},
		};
	}

	public enqueueAuto(_refs: readonly RawTableRef[]): void {}
	public submit(_requests: readonly SliceRequest[]): void {}
	public runWithTemplate(_input: RunSliceWithTemplateInput): void {}

	public prioritize(fileId: string): void {
		this.prioritizedFileIds.push(fileId);
	}

	public cancel(_fileIds?: readonly string[]): void {}
	public setTemplateSelection(_fileId: string, _selection: TemplateSelection): void {}
}

const createExplorerService = ({
	hoveredFileId = null,
	selectedProcessedFileId = null,
	selectedRawFileId = null,
}: {
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
		getPaneInput: () => null,
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
