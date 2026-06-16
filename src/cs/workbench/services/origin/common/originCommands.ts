/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import {
	type OriginAxisCapabilities,
	type OriginAxisAppearancePatch,
	type OriginAxisFramePatch,
	type OriginAxisRangePatch,
	type OriginAxisScalePatch,
	type OriginAxisSide,
	type OriginAxisSpacingPatch,
	type OriginAxisTitlePatch,
	buildOriginAxisCapabilities,
} from "src/cs/workbench/services/origin/common/originCapabilities";
import {
	type OriginLegendStylePatch,
	type OriginStyleCapabilities,
	buildOriginStyleCapabilities,
} from "src/cs/workbench/services/origin/common/originStyleCapabilities";

export const OriginSemanticCommandId = {
	AxisAppearance: "origin.axis.appearance",
	AxisScale: "origin.axis.scale",
	AxisRange: "origin.axis.range",
	AxisTitle: "origin.axis.title",
	AxisSpacing: "origin.axis.spacing",
	AxisFrame: "origin.axis.frame",
	AxisAdvancedCommands: "origin.axis.advancedCommands",
	StyleLegend: "origin.style.legend",
	StyleAdvancedCommands: "origin.style.advancedCommands",
} as const;

export type OriginSemanticCommandId = typeof OriginSemanticCommandId[keyof typeof OriginSemanticCommandId];

export type OriginCommand<TId extends OriginSemanticCommandId = OriginSemanticCommandId, TPayload = unknown> = {
	readonly id: TId;
	readonly payload?: TPayload;
};

export const createOriginCommand = <TId extends OriginSemanticCommandId, TPayload>(
	id: TId,
	payload?: TPayload,
): OriginCommand<TId, TPayload> => ({ id, payload });

const hasPayload = (value: unknown): boolean => {
	if (value === undefined || value === null) {
		return false;
	}
	if (Array.isArray(value)) {
		return value.length > 0;
	}
	if (typeof value === "object") {
		return Object.values(value).some(hasPayload);
	}
	return true;
};

export const originAxisAppearanceCommand = (
	appearance: Partial<Record<OriginAxisSide, OriginAxisAppearancePatch>> | undefined,
): OriginCommand<typeof OriginSemanticCommandId.AxisAppearance, Partial<Record<OriginAxisSide, OriginAxisAppearancePatch>>> | undefined =>
	hasPayload(appearance) ? createOriginCommand(OriginSemanticCommandId.AxisAppearance, appearance) : undefined;

export const originAxisScaleCommand = (
	scale: Partial<Record<OriginAxisSide, OriginAxisScalePatch>> | undefined,
): OriginCommand<typeof OriginSemanticCommandId.AxisScale, Partial<Record<OriginAxisSide, OriginAxisScalePatch>>> | undefined =>
	hasPayload(scale) ? createOriginCommand(OriginSemanticCommandId.AxisScale, scale) : undefined;

export const originAxisRangeCommand = (
	range: Partial<Record<OriginAxisSide, OriginAxisRangePatch>> | undefined,
): OriginCommand<typeof OriginSemanticCommandId.AxisRange, Partial<Record<OriginAxisSide, OriginAxisRangePatch>>> | undefined =>
	hasPayload(range) ? createOriginCommand(OriginSemanticCommandId.AxisRange, range) : undefined;

export const originAxisTitleCommand = (
	title: Partial<Record<OriginAxisSide, OriginAxisTitlePatch>> | undefined,
): OriginCommand<typeof OriginSemanticCommandId.AxisTitle, Partial<Record<OriginAxisSide, OriginAxisTitlePatch>>> | undefined =>
	hasPayload(title) ? createOriginCommand(OriginSemanticCommandId.AxisTitle, title) : undefined;

export const originAxisSpacingCommand = (
	spacing: OriginAxisSpacingPatch | undefined,
): OriginCommand<typeof OriginSemanticCommandId.AxisSpacing, OriginAxisSpacingPatch> | undefined =>
	hasPayload(spacing) ? createOriginCommand(OriginSemanticCommandId.AxisSpacing, spacing) : undefined;

export const originAxisFrameCommand = (
	frame: OriginAxisFramePatch | undefined,
): OriginCommand<typeof OriginSemanticCommandId.AxisFrame, OriginAxisFramePatch> | undefined =>
	hasPayload(frame) ? createOriginCommand(OriginSemanticCommandId.AxisFrame, frame) : undefined;

export const originStyleLegendCommand = (
	legend: OriginLegendStylePatch | undefined,
): OriginCommand<typeof OriginSemanticCommandId.StyleLegend, OriginLegendStylePatch> | undefined =>
	hasPayload(legend) ? createOriginCommand(OriginSemanticCommandId.StyleLegend, legend) : undefined;

const pushCommand = (commands: OriginCommand[], command: OriginCommand | undefined): void => {
	if (command) {
		commands.push(command);
	}
};

export const buildOriginCapabilitiesFromCommands = (
	commands: readonly OriginCommand[],
): { readonly axis?: OriginAxisCapabilities; readonly style?: OriginStyleCapabilities } => {
	const axis: {
		appearance?: OriginAxisCapabilities["appearance"];
		range?: OriginAxisCapabilities["range"];
		scale?: OriginAxisCapabilities["scale"];
		title?: OriginAxisCapabilities["title"];
		spacing?: OriginAxisCapabilities["spacing"];
		frame?: OriginAxisCapabilities["frame"];
		advancedCommands?: OriginAxisCapabilities["advancedCommands"];
	} = {};
	const style: {
		legend?: OriginStyleCapabilities["legend"];
		advancedCommands?: OriginStyleCapabilities["advancedCommands"];
	} = {};

	for (const command of commands) {
		switch (command.id) {
			case OriginSemanticCommandId.AxisAppearance:
				axis.appearance = command.payload as OriginAxisCapabilities["appearance"];
				break;
			case OriginSemanticCommandId.AxisScale:
				axis.scale = command.payload as OriginAxisCapabilities["scale"];
				break;
			case OriginSemanticCommandId.AxisRange:
				axis.range = command.payload as OriginAxisCapabilities["range"];
				break;
			case OriginSemanticCommandId.AxisTitle:
				axis.title = command.payload as OriginAxisCapabilities["title"];
				break;
			case OriginSemanticCommandId.AxisSpacing:
				axis.spacing = command.payload as OriginAxisCapabilities["spacing"];
				break;
			case OriginSemanticCommandId.AxisFrame:
				axis.frame = command.payload as OriginAxisCapabilities["frame"];
				break;
			case OriginSemanticCommandId.AxisAdvancedCommands:
				axis.advancedCommands = command.payload as OriginAxisCapabilities["advancedCommands"];
				break;
			case OriginSemanticCommandId.StyleLegend:
				style.legend = command.payload as OriginStyleCapabilities["legend"];
				break;
			case OriginSemanticCommandId.StyleAdvancedCommands:
				style.advancedCommands = command.payload as OriginStyleCapabilities["advancedCommands"];
				break;
		}
	}

	const normalizedAxis = buildOriginAxisCapabilities(axis);
	const normalizedStyle = buildOriginStyleCapabilities(style);
	return {
		axis: Object.keys(normalizedAxis).length ? normalizedAxis : undefined,
		style: normalizedStyle,
	};
};

export const compactOriginCommands = (
	commands: readonly (OriginCommand | undefined)[],
): OriginCommand[] => {
	const next: OriginCommand[] = [];
	for (const command of commands) {
		pushCommand(next, command);
	}
	return next;
};
