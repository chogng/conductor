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
	SliceResourceRequest,
} from "src/cs/workbench/services/slice/common/slice";
import type { TemplateSelection } from "src/cs/workbench/services/slice/common/templateSelection";

type ResourceSheetIdentity = {
	readonly resource: URI;
	readonly sheetId?: string | null;
};

suite("workbench/services/slice/test/browser/slicePriorityContribution", () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test("ignores existing explorer selection and hover without resource targets on startup", () => {
		const explorer = createExplorerService();
		const sliceService = new TestSliceService();

		store.add(new SlicePriorityContribution(explorer.service, sliceService));

		assert.deepEqual(sliceService.prioritizedResources, []);
		explorer.dispose();
	});

	test("ignores explorer selection and hover events without resource targets", () => {
		const explorer = createExplorerService();
		const sliceService = new TestSliceService();
		store.add(new SlicePriorityContribution(explorer.service, sliceService));

		explorer.fireSelection({ kind: "chart", selectedResource: null });
		explorer.fireHoveredResource({ target: null });

		assert.deepEqual(sliceService.prioritizedResources, []);
		explorer.dispose();
	});

	test("prioritizes resources from explorer selection and hover targets", () => {
		const resource = URI.file("/workspace/source.xlsx");
		const explorer = createExplorerService({
			hoveredResource: { resource, sheetId: "sheet-a" },
			selectedResource: resource,
			selectedSheetId: "sheet-a",
		});
		const sliceService = new TestSliceService();

		store.add(new SlicePriorityContribution(explorer.service, sliceService));

		assert.deepEqual(sliceService.prioritizedResources.map(resource => ({
			resource: resource.resource.toString(),
			sheetId: resource.sheetId,
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
	public readonly onDidChangeTemplateSelection = Event.None as Event<ResourceSheetIdentity>;
	public readonly onDidChangeResourceSliceResult = Event.None as Event<ResourceSheetIdentity>;
	public readonly prioritizedResources: ResourceSheetIdentity[] = [];

	public getState(): SliceState {
		return {
			queueLength: 0,
			templateSelections: [],
		};
	}

	public getResourceResult(): null {
		return null;
	}

	public getResourceState(): undefined {
		return undefined;
	}

	public getTemplateSelection(): TemplateSelection {
		return { kind: "auto" };
	}

	public submitResource(_requests: readonly SliceResourceRequest[]): void {}

	public prioritizeResource(resource: URI, sheetId?: string | null): void {
		this.prioritizedResources.push({ resource, sheetId });
	}

	public cancelResource(_resources: readonly ResourceSheetIdentity[]): void {}
	public setTemplateSelection(_resource: URI, _sheetId: string | null | undefined, _selection: TemplateSelection): void {}
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
		}),
		hasPendingSourceFiles: false,
		hoveredResource,
		onDidChangeExpandedFolderKeys: Event.None as IExplorerService["onDidChangeExpandedFolderKeys"],
		onDidChangeHoveredResource: onDidChangeHoveredResourceEmitter.event,
		onDidChangePaneInput: Event.None as Event<void>,
		onDidChangePendingSourceFiles: Event.None as IExplorerService["onDidChangePendingSourceFiles"],
		onDidChangeSelection: onDidChangeSelectionEmitter.event,
		onDidChangeViewLayout: Event.None as IExplorerService["onDidChangeViewLayout"],
		onDidChangeVisibleTargets: Event.None as IExplorerService["onDidChangeVisibleTargets"],
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
		setVisibleTargets: () => undefined,
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
