/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from "../../../../platform/instantiation/common/instantiation.js";
import { isAutoTemplateId } from "./autoTemplate.js";
import type { TemplateApplyConfig } from "./templateApplyConfigUtils.js";
import { normalizeColumnIndexes } from "./templateXYBinding.js";
import { normalizeTemplateXRanges, type TemplateXRange } from "./templateXRange.js";

type JsonRecord = Record<string, unknown>;

export type TemplateStoreSaveInput = TemplateApplyConfig & {
	readonly id?: unknown;
};

export type StoredTemplate = JsonRecord & {
	id?: unknown;
	xColumns: number[];
	xRanges: TemplateXRange[];
	xSegmentationMode: string;
	xPoints: string;
	xSegments: string;
	selectedColumns: number[];
	yColumns: number[];
};

export type TemplateStoreData = {
	templates: StoredTemplate[];
	nextTemplateId: number;
};

export type NormalizedTemplateStoreData = {
	readonly data: TemplateStoreData;
	readonly didChange: boolean;
};

export const ITemplateStoreService =
  createDecorator<ITemplateStoreService>("templateStoreService");

export interface ITemplateStoreService {
  readonly _serviceBrand: undefined;

  getTemplates(): Promise<unknown>;
  saveTemplate(template: TemplateStoreSaveInput): Promise<unknown>;
  deleteTemplate(id: string): Promise<void>;
}

const X_SEGMENTATION_MODES = new Set([
	"auto",
	"points",
	"segments",
]);

const isRecord = (value: unknown): value is JsonRecord =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const isStoredTemplate = (value: StoredTemplate | null): value is StoredTemplate =>
	value !== null;

export const TEMPLATE_FILENAME = "template.json";
const FIRST_CUSTOM_TEMPLATE_ID = 1;

export function createTemplateStoreId(nextTemplateId: unknown = FIRST_CUSTOM_TEMPLATE_ID): string {
	return String(normalizeNextTemplateId(nextTemplateId));
}

function normalizeTemplateTextValue(value: unknown): string {
	if (value == null) {
		return "";
	}

	return String(value);
}

function normalizeXSegmentationMode(mode: unknown): string {
	const normalizedMode =
		typeof mode === "string" ? mode.trim().toLowerCase() : "";
	if (X_SEGMENTATION_MODES.has(normalizedMode)) {
		return normalizedMode;
	}

	return "auto";
}

export function normalizeStoredTemplate(template: unknown): StoredTemplate | null {
	if (!isRecord(template)) {
		return null;
	}
	const { xyBindingMode: _xyBindingMode, ...templateWithoutDeprecatedBindingMode } = template;
	const rawYColumns = Array.isArray(template.yColumns)
		? template.yColumns
		: Array.isArray(template.selectedColumns)
			? template.selectedColumns
			: [];

	const xColumns = normalizeColumnIndexes(
		Array.isArray(template.xColumns) ? template.xColumns : [],
	);
	return {
		...templateWithoutDeprecatedBindingMode,
		xColumns,
		xRanges: normalizeTemplateXRanges(
			Array.isArray(template.xRanges) ? template.xRanges : undefined,
			template.xDataStart,
			template.xDataEnd,
			xColumns,
		),
		xSegmentationMode: normalizeXSegmentationMode(
			template.xSegmentationMode,
		),
		xPoints: normalizeTemplateTextValue(template.xPoints),
		xSegments: normalizeTemplateTextValue(template.xSegments),
		selectedColumns: Array.isArray(template.selectedColumns)
			? template.selectedColumns.map(n => Number(n)).filter(Number.isFinite)
			: [],
		yColumns: normalizeColumnIndexes(rawYColumns),
	};
}

function normalizeTemplateId(id: unknown): string {
	return String(id ?? "").trim();
}

function parseCustomTemplateId(id: unknown): number | null {
	const normalized = normalizeTemplateId(id);
	if (!/^\d+$/.test(normalized)) {
		return null;
	}

	const sequence = Number(normalized);
	return Number.isSafeInteger(sequence) &&
		sequence >= FIRST_CUSTOM_TEMPLATE_ID &&
		!isAutoTemplateId(normalized)
		? sequence
		: null;
}

export function normalizeTemplateStoreId(id: unknown): string | null {
	const sequence = parseCustomTemplateId(id);
	return sequence === null ? null : String(sequence);
}

function normalizeNextTemplateId(nextTemplateId: unknown): number {
	const parsed = parseCustomTemplateId(nextTemplateId);
	return parsed ?? FIRST_CUSTOM_TEMPLATE_ID;
}

function getHighestTemplateSequenceId(templates: readonly StoredTemplate[]): number {
	let highest = 0;
	for (const template of templates) {
		const sequence = parseCustomTemplateId(template.id);
		if (sequence !== null) {
			highest = Math.max(highest, sequence);
		}
	}
	return highest;
}

function getNextAvailableTemplateSequenceId(
	usedIds: ReadonlySet<number>,
	start: number,
): number {
	let sequence = Math.max(FIRST_CUSTOM_TEMPLATE_ID, start);
	while (usedIds.has(sequence)) {
		sequence++;
	}
	return sequence;
}

function createUniqueTemplateId(
	usedIds: Set<number>,
	nextTemplateId: number,
): { readonly templateId: string; readonly nextTemplateId: number } {
	const sequence = getNextAvailableTemplateSequenceId(usedIds, nextTemplateId);
	usedIds.add(sequence);
	return {
		templateId: String(sequence),
		nextTemplateId: sequence + 1,
	};
}

function normalizeStoredTemplateIds(
	templates: readonly StoredTemplate[],
	nextTemplateId: number,
): {
	readonly templates: StoredTemplate[];
	readonly didChange: boolean;
	readonly nextTemplateId: number;
} {
	const usedIds = new Set<number>();
	let didChange = false;
	let nextAvailableTemplateId = Math.max(
		nextTemplateId,
		getHighestTemplateSequenceId(templates) + 1,
	);
	const normalizedTemplates = templates.map((template) => {
		const currentSequenceId = parseCustomTemplateId(template.id);
		if (currentSequenceId !== null && !usedIds.has(currentSequenceId)) {
			usedIds.add(currentSequenceId);
			const currentId = String(currentSequenceId);
			if (template.id === currentId) {
				return template;
			}

			didChange = true;
			return {
				...template,
				id: currentId,
			};
		}

		const created = createUniqueTemplateId(usedIds, nextAvailableTemplateId);
		nextAvailableTemplateId = created.nextTemplateId;
		didChange = true;
		return {
			...template,
			id: created.templateId,
		};
	});
	const normalizedNextTemplateId =
		getNextAvailableTemplateSequenceId(usedIds, nextAvailableTemplateId);

	return {
		didChange,
		nextTemplateId: normalizedNextTemplateId,
		templates: normalizedTemplates,
	};
}

export function normalizeStoredTemplates(
	templates: unknown,
	options: { readonly nextTemplateId?: unknown } = {},
): StoredTemplate[] {
	return normalizeStoredTemplatesWithMetadata(templates, options).templates;
}

function normalizeStoredTemplatesWithMetadata(
	templates: unknown,
	options: { readonly nextTemplateId?: unknown } = {},
): {
	readonly templates: StoredTemplate[];
	readonly didChange: boolean;
	readonly nextTemplateId: number;
} {
	const nextTemplateId = normalizeNextTemplateId(options.nextTemplateId);
	if (!Array.isArray(templates)) {
		return {
			didChange: templates !== undefined,
			nextTemplateId,
			templates: [],
		};
	}

	const normalizedTemplates = templates
		.map(template => normalizeStoredTemplate(template))
		.filter(isStoredTemplate);
	const filteredInvalidTemplates = normalizedTemplates.length !== templates.length;
	const withIds = normalizeStoredTemplateIds(
		normalizedTemplates,
		nextTemplateId,
	);

	return {
		didChange: filteredInvalidTemplates || withIds.didChange,
		nextTemplateId: withIds.nextTemplateId,
		templates: withIds.templates,
	};
}

export function toTemplateNameKey(name: unknown): string {
	return String(name || "").trim().toLowerCase();
}

export function buildDefaultTemplateStoreData(): TemplateStoreData {
	return {
		templates: [],
		nextTemplateId: FIRST_CUSTOM_TEMPLATE_ID,
	};
}

export function normalizeTemplateStoreDataWithMetadata(
	raw: unknown,
	options: { readonly nextTemplateId?: unknown } = {},
): NormalizedTemplateStoreData {
	const next = isRecord(raw) ? raw : {};
	const rawNextTemplateId = options.nextTemplateId ?? next.nextTemplateId;
	const normalizedTemplates = normalizeStoredTemplatesWithMetadata(next.templates, {
		nextTemplateId: rawNextTemplateId,
	});
	return {
		data: {
			templates: normalizedTemplates.templates,
			nextTemplateId: normalizedTemplates.nextTemplateId,
		},
		didChange: !isRecord(raw) ||
			!Array.isArray(next.templates) ||
			next.nextTemplateId !== normalizedTemplates.nextTemplateId ||
			normalizedTemplates.didChange,
	};
}

export function normalizeTemplateStoreData(raw: unknown): TemplateStoreData {
	return normalizeTemplateStoreDataWithMetadata(raw).data;
}
