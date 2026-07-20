/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import type { URI } from "src/cs/base/common/uri";
import { extUri } from "src/cs/base/common/resources";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import { localize } from "src/cs/nls";
import {
	ICalculationService,
	type CalculationResourceResult,
} from "src/cs/workbench/services/calculation/common/calculation";
import {
	createParametersViewState,
	type ParametersFileRecord,
	type ParametersMetricRecord,
	type ParametersViewState,
} from "src/cs/workbench/services/parameters/common/parameterModel";
import {
	IParametersService,
	type ParametersViewStateInput,
} from "src/cs/workbench/services/parameters/common/parameters";

type ResolvedParametersViewStateInput = {
	readonly fileRecord: ParametersFileRecord | null;
	readonly resource: URI | null;
	readonly resultSignature: string | null;
	readonly sheetId: string | null;
};

export class ParametersService extends Disposable implements IParametersService {
	public declare readonly _serviceBrand: undefined;

	private readonly onDidChangeParametersViewStateEmitter = this._register(
		new Emitter<ParametersViewState>(),
	);
	public readonly onDidChangeParametersViewState =
		this.onDidChangeParametersViewStateEmitter.event;

	private viewStateInputKey: string | null = null;
	private viewStateTarget: ParametersViewStateInput | null = null;
	private viewState: ParametersViewState = createDefaultParametersViewState();

	public constructor(
		@ICalculationService private readonly calculationService: ICalculationService,
	) {
		super();

		this._register(this.calculationService.onDidChangeResourceCalculationResult(result => {
			const target = this.viewStateTarget;
			if (
				target?.resource &&
				extUri.isEqual(target.resource, result.resource) &&
				normalizeParametersSheetId(target.sheetId) ===
					normalizeParametersSheetId(result.sheetId)
			) {
				this.updateViewState(target);
			}
		}));
	}

	public getViewState(): ParametersViewState {
		return this.viewState;
	}

	public updateViewState(input: ParametersViewStateInput): ParametersViewState {
		const resolvedInput = this.resolveViewStateInput(input);
		this.viewStateTarget = resolvedInput.resource
			? {
				resource: resolvedInput.resource,
				sheetId: resolvedInput.sheetId,
			}
			: null;
		if (resolvedInput.resource && !resolvedInput.fileRecord) {
			this.calculationService.prioritizeResource(
				resolvedInput.resource,
				resolvedInput.sheetId,
			);
		}
		const inputKey = createParametersViewStateInputKey(resolvedInput);
		if (this.viewStateInputKey === inputKey) {
			return this.viewState;
		}

		const viewState = this.createViewStateForResolvedInput(resolvedInput);
		this.viewStateInputKey = inputKey;
		this.viewState = viewState;
		this.onDidChangeParametersViewStateEmitter.fire(viewState);
		return viewState;
	}

	private resolveViewStateInput(
		input: ParametersViewStateInput,
	): ResolvedParametersViewStateInput {
		const resource = input.resource ?? null;
		const sheetId = normalizeParametersSheetId(input.sheetId);
		if (!resource) {
			return {
				fileRecord: null,
				resource: null,
				resultSignature: null,
				sheetId: null,
			};
		}

		const result = this.calculationService.getResourceResult(resource, sheetId);
		return {
			fileRecord: result ? createParametersFileRecord(result) : null,
			resource,
			resultSignature: result?.inputSignature ?? null,
			sheetId,
		};
	}

	private createViewStateForResolvedInput(
		input: ResolvedParametersViewStateInput,
	): ParametersViewState {
		return createParametersViewState(null, input.fileRecord);
	}
}

function createDefaultParametersViewState(): ParametersViewState {
	return {
		kind: "empty",
		message: localize("parameters.empty.noData", "No parameter data."),
	};
}

function normalizeParametersSheetId(
	sheetId: string | null | undefined,
): string | null {
	const normalized = String(sheetId ?? "").trim();
	return normalized || null;
}

function createParametersViewStateInputKey(
	input: ResolvedParametersViewStateInput,
): string {
	if (!input.resource) {
		return "empty";
	}
	return [
		input.resource.toString().replace(/\\/g, "/"),
		input.sheetId ?? "",
		input.resultSignature ?? "",
	].join("\0");
}

function createParametersFileRecord(
	result: CalculationResourceResult,
): ParametersFileRecord {
	const metricsByKey = Object.fromEntries(
		Object.entries(result.metricsByKey).map(([key, metric]) => [
			key,
			metric satisfies ParametersMetricRecord,
		]),
	);
	const metricsBySeriesId: Record<string, string[]> = {};
	for (const [key, metric] of Object.entries(result.metricsByKey)) {
		metricsBySeriesId[metric.seriesId] = [
			...(metricsBySeriesId[metric.seriesId] ?? []),
			key,
		];
	}
	return {
		curvesByKey: result.curvesByKey,
		id: result.resource.toString(),
		metricsByKey,
		metricsBySeriesId,
		seriesById: result.seriesById,
		seriesOrder: result.seriesOrder,
	};
}

registerSingleton(IParametersService, ParametersService, InstantiationType.Delayed);
