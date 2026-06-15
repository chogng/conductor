/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from "../../../../platform/instantiation/common/instantiation.js";
import type { TemplateConfig } from "./templateConfigUtils.js";

type JsonRecord = Record<string, unknown>;

export type StoredTemplate = JsonRecord & {
	id?: unknown;
	xSegmentationMode: string;
	xPoints: string;
	xSegments: string;
	selectedColumns: number[];
};

export type TemplateStoreData = {
	templates: StoredTemplate[];
};

export const ITemplateStoreService =
  createDecorator<ITemplateStoreService>("templateStoreService");

export interface ITemplateStoreService {
  readonly _serviceBrand: undefined;

  getTemplates(): Promise<unknown>;
  saveTemplate(template: TemplateConfig): Promise<unknown>;
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

	return {
		...template,
		xSegmentationMode: normalizeXSegmentationMode(
			template.xSegmentationMode,
		),
		xPoints: normalizeTemplateTextValue(template.xPoints),
		xSegments: normalizeTemplateTextValue(template.xSegments),
		selectedColumns: Array.isArray(template.selectedColumns)
			? template.selectedColumns.map(n => Number(n)).filter(Number.isFinite)
			: [],
	};
}

export function normalizeStoredTemplates(templates: unknown): StoredTemplate[] {
	if (!Array.isArray(templates)) {
		return [];
	}

	return templates
		.map(template => normalizeStoredTemplate(template))
		.filter(isStoredTemplate)
		.map((template, index) => ({
			...template,
			id: template.id || `tpl_local_${index}_${Date.now()}`,
		}));
}

export function toTemplateNameKey(name: unknown): string {
	return String(name || "").trim().toLowerCase();
}

export function buildDefaultTemplateStoreData(): TemplateStoreData {
	return {
		templates: [],
	};
}

export function normalizeTemplateStoreData(raw: unknown): TemplateStoreData {
	const next = isRecord(raw) ? raw : {};
	return {
		templates: normalizeStoredTemplates(next.templates),
	};
}
