/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { CancellationToken } from "src/cs/base/common/cancellation";
import { Emitter } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import type { URI } from "src/cs/base/common/uri";
import { ISettingsService, normalizeTableTemplateVisualizationEnabled } from "src/cs/workbench/services/settings/common/settings";
import { IReviewService } from "src/cs/workbench/services/review/common/review";
import { ISliceService } from "src/cs/workbench/services/slice/common/slice";
import { isSavedTemplateSelection } from "src/cs/workbench/services/slice/common/templateSelection";
import { IUserTemplateService } from "src/cs/workbench/services/userTemplate/common/userTemplate";
import { createTemplateTableDecorations } from "src/cs/workbench/contrib/template/browser/templateTableMap";
import {
	createTableDecorationData,
	createTableDecorationResource,
	ITableService,
	parseTableDecorationResource,
	type TableSource,
} from "src/cs/workbench/services/table/common/table";
import {
	IDecorationsService,
	type IDecorationData,
	type IDecorationsProvider,
} from "src/cs/workbench/services/decorations/common/decorations";
import type { Template } from "src/cs/workbench/services/template/common/templateSpec";
import {
	registerWorkbenchContribution2,
	WorkbenchPhase,
	type IWorkbenchContribution,
} from "src/cs/workbench/common/contributions";

const TableTemplateDecorationsContributionId = "workbench.contrib.table.templateDecorations";

export class TableTemplateDecorationsProvider extends Disposable implements IDecorationsProvider {
	private readonly onDidChangeEmitter =
		this._register(new Emitter<readonly URI[] | undefined>());
	public readonly onDidChange = this.onDidChangeEmitter.event;
	public readonly label = "table.template";

	public constructor(
		private readonly reviewService: IReviewService,
		private readonly settingsService: ISettingsService,
		private readonly sliceService: ISliceService,
		private readonly tableService: ITableService,
		private readonly userTemplateService: IUserTemplateService,
	) {
		super();
		this._register(this.tableService.onDidChangeTableViewInput(() => {
			this.fireCurrentTableDecorationChanged();
		}));
		this._register(this.settingsService.onDidChangeConductorSettings(() => {
			this.fireCurrentTableDecorationChanged();
		}));
		this._register(this.reviewService.onDidChangeReview(() => {
			this.fireCurrentTableDecorationChanged();
		}));
		this._register(this.userTemplateService.onDidChangeUserTemplates(() => {
			this.fireCurrentTableDecorationChanged();
		}));
		this._register(this.sliceService.onDidChangeTemplateSelection(target => {
			const resource = createTableDecorationResource({
				resource: target.resource,
				sheetId: target.sheetId ?? null,
			});
			if (resource) {
				this.onDidChangeEmitter.fire([resource]);
			}
		}));
	}

	public async provideDecorations(
		uri: URI,
		token: CancellationToken,
	): Promise<IDecorationData | undefined> {
		const source = parseTableDecorationResource(uri);
		const tableState = this.tableService.getViewInput()?.tableState ?? null;
		if (!source || !tableState?.source || !tableState.file) {
			return undefined;
		}
		if (createTableDecorationResource(
			tableState.source,
			tableState.file.sheetId ?? tableState.selectedSheetId ?? tableState.source.sheetId ?? null,
		)?.toString() !== uri.toString()) {
			return undefined;
		}
		if (!normalizeTableTemplateVisualizationEnabled(
			this.settingsService.getConductorSettings()?.tableTemplateVisualizationEnabled,
		)) {
			return undefined;
		}

		const template = await this.getCurrentTemplate(source, token);
		if (!template || token.isCancellationRequested) {
			return undefined;
		}

		return createTableDecorationData(createTemplateTableDecorations({
			columnCount: tableState.file.columnCount,
			rowCount: tableState.file.rowCount,
			sheetId: tableState.file.sheetId ?? tableState.selectedSheetId ?? source.sheetId ?? null,
			template,
		}));
	}

	private async getCurrentTemplate(
		source: TableSource,
		token: CancellationToken,
	): Promise<Template | null> {
		const selection = this.sliceService.getTemplateSelection(source.resource, source.sheetId ?? null);
		if (isSavedTemplateSelection(selection)) {
			return this.userTemplateService.getTemplate(selection.templateId)?.template ?? null;
		}

		const reviewExecution = await this.reviewService.reviewResourceForExecution({
			resource: source.resource,
			sheetId: source.sheetId ?? null,
		});
		if (token.isCancellationRequested) {
			return null;
		}
		return reviewExecution?.systemRecommendedReviewedTemplate?.template ?? null;
	}

	private fireCurrentTableDecorationChanged(): void {
		const tableState = this.tableService.getViewInput()?.tableState ?? null;
		const source = tableState?.source ?? null;
		if (!source || !tableState?.file) {
			this.onDidChangeEmitter.fire(undefined);
			return;
		}
		const resource = createTableDecorationResource(
			source,
			tableState.file.sheetId ?? tableState.selectedSheetId ?? source.sheetId ?? null,
		);
		if (resource) {
			this.onDidChangeEmitter.fire([resource]);
		}
	}
}

export class TableTemplateDecorationsContribution extends Disposable implements IWorkbenchContribution {
	public constructor(
		@IDecorationsService decorationsService: IDecorationsService,
		@ITableService tableService: ITableService,
		@IReviewService reviewService: IReviewService,
		@ISettingsService settingsService: ISettingsService,
		@ISliceService sliceService: ISliceService,
		@IUserTemplateService userTemplateService: IUserTemplateService,
	) {
		super();
		const provider = this._register(new TableTemplateDecorationsProvider(
			reviewService,
			settingsService,
			sliceService,
			tableService,
			userTemplateService,
		));
		this._register(decorationsService.registerDecorationsProvider(provider));
	}
}

registerWorkbenchContribution2(
	TableTemplateDecorationsContributionId,
	TableTemplateDecorationsContribution,
	WorkbenchPhase.BlockStartup,
);
