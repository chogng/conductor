/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { Event } from "src/cs/base/common/event";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import type { ServicesAccessor, ServiceIdentifier } from "src/cs/platform/instantiation/common/instantiation";
import { IExplorerService } from "src/cs/workbench/contrib/files/browser/files";
import {
	getSliceCommandRawTableRefs,
	runSliceWithTemplateHandler,
} from "src/cs/workbench/contrib/slice/browser/sliceCommands";
import type { FileImportResult, ImportedFileRecord } from "src/cs/workbench/services/files/common/files";
import {
	INotificationService,
	type INotification,
} from "src/cs/workbench/services/notification/common/notificationService";
import { SessionService } from "src/cs/workbench/services/session/browser/sessionService";
import { ISessionService } from "src/cs/workbench/services/session/common/session";
import type { RawTableRef } from "src/cs/workbench/services/session/common/sessionModel";
import {
	ISliceService,
	type RunSliceWithTemplateInput,
	type SliceRequest,
	type SliceState,
} from "src/cs/workbench/services/slice/common/slice";
import { createEmptyTemplateEditorConfig } from "src/cs/workbench/services/template/common/templateEditorConfig";
import {
	type TemplateState,
	ITemplateViewStateService,
} from "src/cs/workbench/contrib/template/browser/templateViewStateService";
import type { TemplateSelection } from "src/cs/workbench/services/slice/common/templateSelection";

suite("workbench/contrib/slice/test/browser/sliceCommands", () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test("runs auto slice for every raw table when current template selection is auto", () => {
		const sessionService = store.add(new SessionService());
		sessionService.commitFileImport(createImportResult());
		const sliceService = new TestSliceService();

		runSliceWithTemplateHandler(createAccessor({
			sessionService,
			sliceService,
			templateState: createTemplateState({
				selectedTemplateId: null,
			}),
		}));

		assert.deepEqual(sliceService.runs.map(run => run.ref), [{
			fileId: "file-a",
			rawTableId: "table-a",
		}]);
		assert.deepEqual(sliceService.runs.map(run => run.selection), [{ kind: "auto" }]);
	});

	test("runs inline canonical template selection from the current template form", () => {
		const sessionService = store.add(new SessionService());
		sessionService.commitFileImport(createImportResult());
		const sliceService = new TestSliceService();

		runSliceWithTemplateHandler(createAccessor({
			sessionService,
			sliceService,
			templateState: createTemplateState({
				selectedTemplateId: "template-a",
				formState: createEmptyTemplateEditorConfig({
					name: "Template A",
					xColumns: [0],
					xDataStart: "A2",
					xDataEnd: "A3",
					yColumns: [1],
				}),
			}),
		}));

		const selection = sliceService.runs[0]?.selection;
		assert.equal(selection?.kind, "inline");
		assert.equal(selection?.kind === "inline" ? selection.template.id : null, "template-a");
		assert.equal(selection?.kind === "inline" ? selection.template.blocks[0]?.x.columns[0] : null, 0);
		assert.equal(selection?.kind === "inline" ? selection.template.blocks[0]?.y.columns[0] : null, 1);
	});

	test("incremental refs skip files with existing slice runs", () => {
		const sessionService = store.add(new SessionService());
		sessionService.commitFileImport(createImportResult());
		sessionService.commitSliceRuns([{
			run: {
				errors: [],
				fileId: "file-a",
				id: "slice-run-a",
				inputRanges: [],
				mode: "auto",
				outputCurveKeys: [],
				outputSeriesIds: [],
				rawTableId: "table-a",
				selection: { kind: "auto" },
				sourceRawTableVersion: 1,
				template: {
					blocks: [],
					name: "Template",
					schemaVersion: 1,
					stopOnError: false,
					version: 1,
				},
				templateFingerprint: "template:test",
				warnings: [],
			},
			curves: [],
			series: [],
		}]);

		assert.deepEqual(getSliceCommandRawTableRefs(sessionService.getSnapshot(), true), []);
		assert.deepEqual(getSliceCommandRawTableRefs(sessionService.getSnapshot(), false), [{
			fileId: "file-a",
			rawTableId: "table-a",
		}]);
	});

	test("does not run while explorer has pending sources", () => {
		const sessionService = store.add(new SessionService());
		sessionService.commitFileImport(createImportResult());
		const sliceService = new TestSliceService();
		const notifications: INotification[] = [];

		runSliceWithTemplateHandler(createAccessor({
			hasPendingSourceFiles: true,
			notifications,
			sessionService,
			sliceService,
		}));

		assert.deepEqual(sliceService.runs, []);
		assert.equal(notifications[0]?.id, "slice.notification");
	});
});

class TestSliceService implements ISliceService {
	public declare readonly _serviceBrand: undefined;
	public readonly onDidChangeSliceState = Event.None as Event<void>;
	public readonly runs: RunSliceWithTemplateInput[] = [];

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
	public runWithTemplate(input: RunSliceWithTemplateInput): void {
		this.runs.push(input);
	}
	public prioritize(_fileId: string): void {}
	public cancel(_fileIds?: readonly string[]): void {}
	public setTemplateSelection(_fileId: string, _selection: TemplateSelection): void {}
}

const createAccessor = ({
	hasPendingSourceFiles = false,
	notifications = [],
	sessionService,
	sliceService,
	templateState = createTemplateState(),
}: {
	readonly hasPendingSourceFiles?: boolean;
	readonly notifications?: INotification[];
	readonly sessionService: SessionService;
	readonly sliceService: ISliceService;
	readonly templateState?: TemplateState;
}): ServicesAccessor => {
	const services = new Map<ServiceIdentifier<unknown>, unknown>([
		[IExplorerService, {
			_serviceBrand: undefined,
			hasPendingSourceFiles,
		}],
		[INotificationService, {
			_serviceBrand: undefined,
			notify: (notification: INotification) => {
				notifications.push(notification);
			},
		}],
		[ISessionService, sessionService],
		[ISliceService, sliceService],
		[ITemplateViewStateService, createTemplateViewStateService(templateState)],
	]);
	return {
		get: <T>(id: ServiceIdentifier<T>): T =>
			services.get(id as ServiceIdentifier<unknown>) as T,
	};
};

const createTemplateViewStateService = (state: TemplateState): ITemplateViewStateService => ({
	_serviceBrand: undefined,
	cancelTemplateEditor: () => undefined,
	createTemplateDraft: () => undefined,
	editTemplate: () => false,
	finishTemplateEditor: () => undefined,
	getState: () => state,
	onDidChangeTemplateState: Event.None as Event<TemplateState>,
	selectTemplate: () => false,
	setFormState: () => undefined,
});

const createTemplateState = (overrides: Partial<TemplateState> = {}): TemplateState => ({
	formState: createEmptyTemplateEditorConfig(),
	mode: "management",
	selectedTemplateId: null,
	...overrides,
});

const createImportResult = (): FileImportResult => ({
	createdAt: 1,
	diagnostics: [],
	files: [createImportedFile()],
});

const createImportedFile = (): ImportedFileRecord => ({
	id: "file-a",
	kind: "csv",
	name: "Raw.csv",
	raw: {
		fileId: "file-a",
		fileName: "Raw.csv",
		rawTablesById: {
			"table-a": {
				columnCount: 2,
				fileId: "file-a",
				maxCellLengths: [],
				rawTableId: "table-a",
				rowCount: 2,
				rows: {
					kind: "inline",
					values: [
						["Vg", "Id"],
						["0", "1"],
					],
				},
				source: {
					kind: "csv",
				},
			},
		},
		rawTableOrder: ["table-a"],
	},
});
