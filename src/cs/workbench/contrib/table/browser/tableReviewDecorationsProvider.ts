/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import type { URI } from "src/cs/base/common/uri";
import {
	registerWorkbenchContribution2,
	WorkbenchPhase,
	type IWorkbenchContribution,
} from "src/cs/workbench/common/contributions";
import {
	IDecorationsService,
	type IDecorationData,
	type IDecorationsProvider,
} from "src/cs/workbench/services/decorations/common/decorations";
import { IReviewService } from "src/cs/workbench/services/review/common/review";
import type { ReviewProofRange, ReviewSummaryTarget } from "src/cs/workbench/services/review/common/reviewModel";
import { ISettingsService, normalizeTableTemplateVisualizationEnabled } from "src/cs/workbench/services/settings/common/settings";
import { ISliceService } from "src/cs/workbench/services/slice/common/slice";
import {
	createTableDecorationData,
	createTableDecorationResource,
	ITableService,
	parseTableDecorationResource,
	type TableRangeDecoration,
	type TableSource,
} from "src/cs/workbench/services/table/common/table";

const TableReviewDecorationsContributionId = "workbench.contrib.table.reviewDecorations";

export class TableReviewDecorationsProvider extends Disposable implements IDecorationsProvider {
	private readonly onDidChangeEmitter =
		this._register(new Emitter<readonly URI[] | undefined>());
	public readonly onDidChange = this.onDidChangeEmitter.event;
	public readonly label = "table.review";

	public constructor(
		private readonly reviewService: IReviewService,
		private readonly settingsService: ISettingsService,
		private readonly sliceService: ISliceService,
		private readonly tableService: ITableService,
	) {
		super();
		this._register(this.tableService.onDidChangeTableViewInput(() => {
			this.fireCurrentTableDecorationChanged();
		}));
		this._register(this.settingsService.onDidChangeConductorSettings(() => {
			this.fireCurrentTableDecorationChanged();
		}));
		this._register(this.reviewService.onDidChangeReview(targets => {
			if (this.isCurrentTableReviewChanged(targets)) {
				this.fireCurrentTableDecorationChanged();
			}
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

	public provideDecorations(
		uri: URI,
	): IDecorationData | undefined {
		const source = parseTableDecorationResource(uri);
		const tableState = this.tableService.getViewInput()?.tableState ?? null;
		if (!source || !tableState?.source || !tableState.file) {
			return undefined;
		}
		const sheetId = tableState.file.sheetId ??
			tableState.selectedSheetId ??
			tableState.source.sheetId ??
			null;
		if (createTableDecorationResource(tableState.source, sheetId)?.toString() !== uri.toString()) {
			return undefined;
		}
		if (
			this.sliceService.getTemplateSelection(source.resource, source.sheetId ?? null).kind !== "auto" ||
			!normalizeTableTemplateVisualizationEnabled(
				this.settingsService.getConductorSettings()?.tableTemplateVisualizationEnabled,
			)
		) {
			return undefined;
		}

		const reviewedTemplate = this.reviewService.getLatestResourceReviewExecution({
			resource: source.resource,
			sheetId: source.sheetId ?? null,
		})?.systemRecommendedReviewedTemplate;
		if (!reviewedTemplate?.evidence?.proofRanges.length) {
			return undefined;
		}

		return createTableDecorationData({
			tableRangeDecorations: createReviewProofTableDecorations({
				columnCount: tableState.file.columnCount,
				proofRanges: reviewedTemplate.evidence.proofRanges,
				rowCount: tableState.file.rowCount,
				sheetId,
			}),
		});
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

	private isCurrentTableReviewChanged(
		targets: readonly ReviewSummaryTarget[],
	): boolean {
		const tableState = this.tableService.getViewInput()?.tableState ?? null;
		const source = tableState?.source ?? null;
		if (!source || !tableState?.file) {
			return false;
		}
		const currentResource = createTableDecorationResource(
			source,
			tableState.file.sheetId ?? tableState.selectedSheetId ?? source.sheetId ?? null,
		);
		return Boolean(currentResource && targets.some(target =>
			createTableDecorationResource({
				resource: target.resource,
				sheetId: target.sheetId ?? null,
			})?.toString() === currentResource.toString(),
		));
	}
}

const createReviewProofTableDecorations = ({
	columnCount,
	proofRanges,
	rowCount,
	sheetId,
}: {
	readonly columnCount: number;
	readonly proofRanges: readonly ReviewProofRange[];
	readonly rowCount: number;
	readonly sheetId: string | null;
}): readonly TableRangeDecoration[] => {
	const normalizedColumnCount = Math.max(0, Math.floor(Number(columnCount) || 0));
	const normalizedRowCount = Math.max(0, Math.floor(Number(rowCount) || 0));
	if (normalizedColumnCount <= 0 || normalizedRowCount <= 0) {
		return [];
	}
	return proofRanges
		.map((range): TableRangeDecoration | null => {
			const column = Math.floor(Number(range.column));
			const startRow = Math.max(0, Math.floor(Number(range.startRow)));
			const endRow = Math.min(normalizedRowCount - 1, Math.floor(Number(range.endRow)));
			if (
				!Number.isInteger(column) ||
				column < 0 ||
				column >= normalizedColumnCount ||
				!Number.isInteger(startRow) ||
				!Number.isInteger(endRow) ||
				startRow > endRow
			) {
				return null;
			}
			return {
				kind: "reviewProof",
				sheetId,
				startRow,
				endRow,
				startCol: column,
				endCol: column,
			};
		})
		.filter((range): range is TableRangeDecoration => Boolean(range));
};

export class TableReviewDecorationsContribution extends Disposable implements IWorkbenchContribution {
	public constructor(
		@IDecorationsService decorationsService: IDecorationsService,
		@IReviewService reviewService: IReviewService,
		@ISettingsService settingsService: ISettingsService,
		@ISliceService sliceService: ISliceService,
		@ITableService tableService: ITableService,
	) {
		super();
		const provider = this._register(new TableReviewDecorationsProvider(
			reviewService,
			settingsService,
			sliceService,
			tableService,
		));
		this._register(decorationsService.registerDecorationsProvider(provider));
	}
}

registerWorkbenchContribution2(
	TableReviewDecorationsContributionId,
	TableReviewDecorationsContribution,
	WorkbenchPhase.BlockStartup,
);
