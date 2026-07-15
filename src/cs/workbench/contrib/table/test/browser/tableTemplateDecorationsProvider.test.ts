/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { Emitter, Event } from "src/cs/base/common/event";
import { URI } from "src/cs/base/common/uri";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import { TableTemplateDecorationsProvider } from "src/cs/workbench/contrib/table/browser/tableTemplateDecorationsProvider";
import type { ISettingsService } from "src/cs/workbench/services/settings/common/settings";
import type {
	IReviewService,
	ReviewChangeEvent,
} from "src/cs/workbench/services/review/common/review";
import type { ISliceService } from "src/cs/workbench/services/slice/common/slice";
import {
	createTableDecorationResource,
	type ITableService,
} from "src/cs/workbench/services/table/common/table";
import type { IUserTemplateService } from "src/cs/workbench/services/userTemplate/common/userTemplate";

suite("workbench/contrib/table/browser/tableTemplateDecorationsProvider", () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test("ignores Review changes outside the active table", () => {
		const activeResource = URI.file("/workspace/Active.xlsx");
		const reviewChanged = new Emitter<ReviewChangeEvent>();
		store.add(reviewChanged);
		const provider = store.add(new TableTemplateDecorationsProvider(
			createReviewService(reviewChanged.event),
			createSettingsService(),
			createSliceService(),
			createTableService(activeResource, "sheet-a"),
			createUserTemplateService(),
		));
		const changes: (readonly URI[] | undefined)[] = [];
		store.add(provider.onDidChange(resources => changes.push(resources)));

		reviewChanged.fire([{
			resource: URI.file("/workspace/Other.xlsx"),
			sheetId: "sheet-a",
		}]);
		reviewChanged.fire([{
			resource: activeResource,
			sheetId: "sheet-b",
		}]);
		assert.deepEqual(changes, []);

		reviewChanged.fire([{
			resource: activeResource,
			sheetId: "sheet-a",
		}]);

		assert.equal(changes.length, 1);
		assert.equal(changes[0]?.length, 1);
		assert.equal(changes[0]?.[0]?.with({ fragment: "" }).toString(), activeResource.toString());
	});

	test("reads the cached Review execution without starting Review work", () => {
		const activeResource = URI.file("/workspace/Active.xlsx");
		let cachedExecutionReads = 0;
		let reviewExecutions = 0;
		const reviewService = {
			_serviceBrand: undefined,
			getLatestResourceReviewExecution: () => {
				cachedExecutionReads += 1;
				return null;
			},
			onDidChangeReview: Event.None,
			reviewResourceForExecution: async () => {
				reviewExecutions += 1;
				return null;
			},
		} as unknown as IReviewService;
		const provider = store.add(new TableTemplateDecorationsProvider(
			reviewService,
			createSettingsService(),
			createSliceService(),
			createTableService(activeResource, "sheet-a"),
			createUserTemplateService(),
		));
		const decorationResource = createTableDecorationResource({
			resource: activeResource,
			sheetId: "sheet-a",
		});
		assert.ok(decorationResource);

		assert.equal(provider.provideDecorations(decorationResource), undefined);
		assert.deepEqual({ cachedExecutionReads, reviewExecutions }, {
			cachedExecutionReads: 1,
			reviewExecutions: 0,
		});
	});
});

const createReviewService = (
	onDidChangeReview: IReviewService["onDidChangeReview"],
): IReviewService => ({
	_serviceBrand: undefined,
	onDidChangeReview,
} as unknown as IReviewService);

const createSettingsService = (): ISettingsService => ({
	onDidChangeConductorSettings: Event.None,
} as unknown as ISettingsService);

const createSliceService = (): ISliceService => ({
	getTemplateSelection: () => ({ kind: "auto" }),
	onDidChangeTemplateSelection: Event.None,
} as unknown as ISliceService);

const createTableService = (
	resource: URI,
	sheetId: string,
): ITableService => ({
	getViewInput: () => ({
		tableState: {
			file: { sheetId },
			selectedSheetId: sheetId,
			source: { resource, sheetId },
		},
	}),
	onDidChangeTableViewInput: Event.None,
} as unknown as ITableService);

const createUserTemplateService = (): IUserTemplateService => ({
	onDidChangeUserTemplates: Event.None,
} as unknown as IUserTemplateService);
