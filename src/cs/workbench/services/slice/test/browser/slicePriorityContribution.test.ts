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
	ExplorerHoveredResourceChangeEvent,
	ExplorerResourceTarget,
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

suite("workbench/services/slice/test/browser/slicePriorityContribution", () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test("ignores existing explorer selection and hover without URI targets on startup", () => {
		const explorer = createExplorerService();
		const sliceService = new TestSliceService();

		store.add(new SlicePriorityContribution(explorer.service, sliceService));

		assert.deepEqual(sliceService.prioritizedUriTargets, []);
		explorer.dispose();
	});

	test("ignores explorer selection and hover events without URI targets", () => {
		const explorer = createExplorerService();
		const sliceService = new TestSliceService();
		store.add(new SlicePriorityContribution(explorer.service, sliceService));

		explorer.fireSelection({ kind: "chart", selectedResource: null });
		explorer.fireHoveredResource({ target: null });

		assert.deepEqual(sliceService.prioritizedUriTargets, []);
		explorer.dispose();
	});

	test("prioritizes URI targets from explorer selection and hover targets", () => {
		const resource = URI.file("/workspace/source.xlsx");
		const explorer = createExplorerService({
			hoveredResource: { resource, sheetId: "sheet-a" },
			selectedResource: resource,
			selectedSheetId: "sheet-a",
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
			queueLength: 0,
			templateSelections: [],
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

	public cancelUri(_targets: readonly SliceUriTarget[]): void {}
	public setTemplateSelection(_target: SliceUriTarget, _selection: TemplateSelection): void {}
}

const createExplorerService = ({
	hoveredResource = null,
	selectedResource = null,
	selectedSheetId = null,
}: {
	readonly hoveredResource?: ExplorerResourceTarget | null;
	readonly selectedResource?: URI | null;
	readonly selectedSheetId?: string | null;
} = {}): {
	readonly dispose: () => void;
	readonly fireHoveredResource: (event: ExplorerHoveredResourceChangeEvent) => void;
	readonly fireSelection: (event: ExplorerSelectionChangeEvent) => void;
	readonly service: IExplorerService;
} => {
	const onDidChangeHoveredResourceEmitter = new Emitter<ExplorerHoveredResourceChangeEvent>();
	const onDidChangeSelectionEmitter = new Emitter<ExplorerSelectionChangeEvent>();
	const service: IExplorerService = {
		_serviceBrand: undefined,
		applyBulkEdit: () => Promise.resolve(),
		expandedFolderKeys: [],
		getCollapsedFolderKeys: () => [],
		getContext: () => ({
			editable: null,
			expandedFolderKeys: [],
			hoveredResource,
			selectedResource,
			selectedSheetId,
			toCopy: {
				isCut: false,
				resources: [],
			},
			viewLayout: "tree",
		}) satisfies ExplorerContext,
		getPaneInput: () => ({
			files: [],
			mode: "chart",
			selectedResource,
			selectedSheetId,
			selectionKind: "chart",
			thumbnailFiles: [],
		}),
		hasPendingSourceFiles: false,
		hoveredResource,
		onDidChangeExpandedFolderKeys: Event.None as IExplorerService["onDidChangeExpandedFolderKeys"],
		onDidChangeHoveredResource: onDidChangeHoveredResourceEmitter.event,
		onDidChangePaneInput: Event.None as Event<void>,
		onDidChangePendingSourceFiles: Event.None as IExplorerService["onDidChangePendingSourceFiles"],
		onDidChangeSelection: onDidChangeSelectionEmitter.event,
		onDidChangeViewLayout: Event.None as IExplorerService["onDidChangeViewLayout"],
		onDidChangeVisibleFileIds: Event.None as IExplorerService["onDidChangeVisibleFileIds"],
		reconcileExpandedFolderKeys: () => [],
		refresh: () => Promise.resolve(),
		registerView: (_view: IExplorerView): IDisposable => ({ dispose: () => undefined }),
		select: () => null,
		selectedResource,
		selectedSheetId,
		setEditable: () => undefined,
		setExpandedFolderKeys: () => undefined,
		setHoveredResource: () => undefined,
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
			onDidChangeHoveredResourceEmitter.dispose();
			onDidChangeSelectionEmitter.dispose();
		},
		fireHoveredResource: event => onDidChangeHoveredResourceEmitter.fire(event),
		fireSelection: event => onDidChangeSelectionEmitter.fire(event),
		service,
	};
};
