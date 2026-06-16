/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import {
	type OriginAxisCapabilities,
	type OriginAxisScaleMode,
	buildOriginAxisAppearancePatch,
	buildOriginAxisSpacingPatch,
	buildOriginAxisTitlePatch,
	buildOriginXAxisDisplayRangePatch,
	buildOriginYAxisAutoRangePatch,
	buildOriginYAxisDisplayRangePatch,
} from "src/cs/workbench/services/origin/common/originCapabilities";
import {
	buildOriginCapabilitiesFromCommands,
	compactOriginCommands,
	type OriginCommand,
	OriginSemanticCommandId,
	originAxisAppearanceCommand,
	originAxisFrameCommand,
	originAxisRangeCommand,
	originAxisScaleCommand,
	originAxisSpacingCommand,
	originAxisTitleCommand,
	originStyleLegendCommand,
} from "src/cs/workbench/services/origin/common/originCommands";
import {
	type OriginStyleCapabilities,
	buildOriginLegendStylePatch,
} from "src/cs/workbench/services/origin/common/originStyleCapabilities";

export const OriginActionId = {
	ApplyChartAxisAppearance: "origin.action.applyChartAxisAppearance",
	ApplyChartStyle: "origin.action.applyChartStyle",
} as const;

export type OriginActionId = typeof OriginActionId[keyof typeof OriginActionId];

export type OriginAction<TId extends OriginActionId = OriginActionId> = {
	readonly id: TId;
	readonly commands: readonly OriginCommand[];
};

export const createOriginAction = <TId extends OriginActionId>(
	id: TId,
	commands: readonly (OriginCommand | undefined)[],
): OriginAction<TId> => ({
	id,
	commands: compactOriginCommands(commands),
});

export type OriginDisplayRange = {
	readonly min?: unknown;
	readonly max?: unknown;
	readonly step?: unknown;
	readonly mode?: OriginAxisScaleMode;
};

export const buildOriginChartAxisAction = (options: {
	readonly axisSettings?: Record<string, unknown> | null;
	readonly chartXRange?: OriginDisplayRange | null;
	readonly chartYRange?: OriginDisplayRange | null;
	readonly payload: {
		readonly yScaleMode?: unknown;
		readonly skipDisplayRange?: unknown;
		readonly xAxisTitle?: unknown;
		readonly yAxisTitle?: unknown;
		readonly yPositiveMin?: unknown;
		readonly yPositiveMax?: unknown;
		readonly yLinearMin?: unknown;
		readonly yLinearMax?: unknown;
	};
}): OriginAction<typeof OriginActionId.ApplyChartAxisAppearance> => {
	const payloadYScaleMode: OriginAxisScaleMode =
		options.payload.yScaleMode === "log" ? "log" : "linear";
	const shouldUseXDisplayRange =
		options.payload.skipDisplayRange !== true && Boolean(options.chartXRange);
	const shouldUseYDisplayRange =
		options.payload.skipDisplayRange !== true &&
		Boolean(options.chartYRange) &&
		options.chartYRange?.mode === payloadYScaleMode;
	const originYScaleMode: OriginAxisScaleMode =
		shouldUseYDisplayRange && options.chartYRange?.mode
			? options.chartYRange.mode
			: payloadYScaleMode;
	const displayXRange = shouldUseXDisplayRange
		? buildOriginXAxisDisplayRangePatch(options.chartXRange)
		: undefined;
	const displayYRange = shouldUseYDisplayRange
		? buildOriginYAxisDisplayRangePatch(originYScaleMode, options.chartYRange)
		: undefined;
	const autoYRange = shouldUseYDisplayRange
		? undefined
		: buildOriginYAxisAutoRangePatch(originYScaleMode, options.payload);

	return createOriginAction(OriginActionId.ApplyChartAxisAppearance, [
		originAxisAppearanceCommand(buildOriginAxisAppearancePatch(options.axisSettings)),
		originAxisScaleCommand({
			x: { mode: "linear" },
			y: { mode: originYScaleMode },
		}),
		originAxisRangeCommand({
			x: displayXRange,
			y: displayYRange ?? autoYRange,
		}),
		originAxisTitleCommand(buildOriginAxisTitlePatch({
			xAxisTitle: options.payload.xAxisTitle,
			yAxisTitle: options.payload.yAxisTitle,
			axisTitleFontSize: options.axisSettings?.axisTitleFontSize ?? null,
		})),
		originAxisSpacingCommand(buildOriginAxisSpacingPatch(options.axisSettings)),
		originAxisFrameCommand({
			xOpposite: true,
			yOpposite: true,
		}),
	]);
};

export const buildOriginChartStyleAction = (options: {
	readonly legendFontSize?: unknown;
}): OriginAction<typeof OriginActionId.ApplyChartStyle> =>
	createOriginAction(OriginActionId.ApplyChartStyle, [
		originStyleLegendCommand(buildOriginLegendStylePatch({
			legendFontSize: options.legendFontSize,
		})),
	]);

export const buildOriginCapabilitiesFromActions = (
	actions: readonly OriginAction[],
): { readonly axis?: OriginAxisCapabilities; readonly style?: OriginStyleCapabilities } =>
	buildOriginCapabilitiesFromCommands(actions.flatMap(action => action.commands));

export { OriginSemanticCommandId };
