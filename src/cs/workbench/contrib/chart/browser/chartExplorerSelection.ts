/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from "src/cs/base/common/lifecycle";
import {
	registerWorkbenchContribution2,
	WorkbenchPhase,
	type IWorkbenchContribution,
} from "src/cs/workbench/common/contributions";
import {
	IExplorerService,
	type IExplorerService as IExplorerServiceType,
} from "src/cs/workbench/contrib/files/browser/files";
import {
	getExplorerFileResourceIdentity,
	getExplorerResourceIdentityKey,
	type ExplorerFileEntry,
} from "src/cs/workbench/contrib/files/common/explorerModel";
import { createChartViewInput } from "src/cs/workbench/services/chart/browser/chartViewInput";
import {
	IChartService,
	type IChartService as IChartServiceType,
} from "src/cs/workbench/services/chart/common/chart";
import {
	IPlotService,
	type IPlotService as IPlotServiceType,
} from "src/cs/workbench/services/plot/common/plot";
import {
	ISliceService,
	type ISliceService as ISliceServiceType,
	type SliceFileState,
} from "src/cs/workbench/services/slice/common/slice";

const ChartExplorerSelectionContributionId = "workbench.contrib.chart.explorerSelection";

export class ChartExplorerSelectionContribution extends Disposable implements IWorkbenchContribution {
	private syncScheduled = false;
	private disposed = false;

	public constructor(
		@IExplorerService private readonly explorerService: IExplorerServiceType,
		@IChartService private readonly chartService: IChartServiceType,
		@IPlotService private readonly plotService: IPlotServiceType,
		@ISliceService private readonly sliceService: ISliceServiceType,
	) {
		super();

		this._register(this.explorerService.onDidChangeFiles(() => this.scheduleSync()));
		this._register(this.explorerService.onDidChangeSelection(() => this.scheduleSync()));
		this._register(this.plotService.onDidChangePlotState(() => this.scheduleSync()));
		this._register(this.sliceService.onDidChangeResourceSliceResult(() => this.scheduleSync()));
		this._register(this.sliceService.onDidChangeSliceState(() => this.scheduleSync()));
		this.sync();
	}

	public sync(): void {
		const file = resolveSelectedExplorerFile(this.explorerService);
		const fileId = normalizeFileId(file?.fileId);
		const resource = getExplorerFileResourceIdentity(file);
		const sliceState = resource
			? this.sliceService.getResourceState(resource.resource, resource.sheetId)
			: undefined;
		const hasChartTarget = Boolean(
			resource && (
				this.sliceService.getResourceResult(resource.resource, resource.sheetId) ||
				isSliceChartTargetState(sliceState)
			),
		);
		const activeResource = hasChartTarget ? resource : null;
		const hasChartData = Boolean(
			activeResource &&
			this.sliceService.getResourceResult(activeResource.resource, activeResource.sheetId),
		);
		const activePlotType = this.plotService.getState().activePlotType;

		this.chartService.updateViewInput(createChartViewInput({
			activeFileId: fileId,
			activePlotType,
			activeResource: activeResource?.resource ?? null,
			activeSheetId: activeResource?.sheetId ?? null,
			chartFileOptions: fileId && file
				? [{ fileId, fileName: String(file.fileName ?? fileId) }]
				: [],
			hasChartData,
			processingStatus:
				sliceState?.state === "queued" || sliceState?.state === "processing"
					? { state: "processing" }
					: undefined,
			showFileSelect: false,
			shouldMountCharts: false,
		}));

		if (!activeResource || !hasChartData) {
			return;
		}

		this.plotService.prefetchPlotDisplayModel({
			plotType: activePlotType,
			resource: activeResource.resource,
			sheetId: activeResource.sheetId ?? null,
		}, "active");
	}

	private scheduleSync(): void {
		if (this.syncScheduled) {
			return;
		}

		this.syncScheduled = true;
		globalThis.queueMicrotask(() => {
			this.syncScheduled = false;
			if (!this.disposed) {
				this.sync();
			}
		});
	}

	public override dispose(): void {
		this.disposed = true;
		super.dispose();
	}
}

function resolveSelectedExplorerFile(
	explorerService: Pick<IExplorerServiceType, "files" | "selectedResource" | "selectedSheetId">,
): ExplorerFileEntry | null {
	const selectedKey = getExplorerResourceIdentityKey({
		resource: explorerService.selectedResource,
		sheetId: explorerService.selectedSheetId,
	});
	if (selectedKey) {
		const selectedFile = explorerService.files.find(file =>
			getExplorerResourceIdentityKey(getExplorerFileResourceIdentity(file)) === selectedKey);
		if (selectedFile) {
			return selectedFile;
		}
	}

	return null;
}

function normalizeFileId(value: unknown): string | null {
	const normalized = String(value ?? "").trim();
	return normalized || null;
}

function isSliceChartTargetState(state: SliceFileState | undefined): boolean {
	return state?.state === "queued" ||
		state?.state === "processing" ||
		state?.state === "ready";
}

registerWorkbenchContribution2(
	ChartExplorerSelectionContributionId,
	ChartExplorerSelectionContribution,
	WorkbenchPhase.BlockStartup,
);
