/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import { getAppSettingsHome } from "src/cs/platform/environment/common/environmentService";
import { IFileService } from "src/cs/platform/files/common/files";
import { INativeHostService } from "src/cs/platform/native/common/native";
import { URI } from "src/cs/base/common/uri";
import { IJSONEditingService } from "src/cs/workbench/services/configuration/common/jsonEditing";
import {
	buildDefaultTemplateStoreData,
	createTemplateStoreId,
	ITemplateStoreService,
	normalizeStoredTemplate,
	normalizeTemplateStoreData,
	normalizeTemplateStoreDataWithMetadata,
	normalizeTemplateStoreId,
	TEMPLATE_FILENAME,
	type StoredTemplate,
	type TemplateStoreData,
	type TemplateStoreSaveInput,
	toTemplateNameKey,
} from "src/cs/workbench/services/template/common/templateStore";

export class ElectronTemplateStoreService implements ITemplateStoreService {
	public declare readonly _serviceBrand: undefined;

	private readonly resource: Promise<URI>;

	public constructor(
		@IFileService private readonly fileService: IFileService,
		@IJSONEditingService private readonly jsonEditingService: IJSONEditingService,
		@INativeHostService private readonly nativeHostService: INativeHostService,
	) {
		this.resource = this.resolveTemplateResource();
	}

	public async getTemplates(): Promise<unknown> {
		return (await this.readStore()).templates;
	}

	public async saveTemplate(template: TemplateStoreSaveInput): Promise<unknown> {
		const store = await this.readStore();
		const templateId = normalizeTemplateStoreId(template.id);
		const normalizedTemplate = normalizeStoredTemplate({
			...template,
			id: templateId ?? createTemplateStoreId(store.nextTemplateId),
		});

		if (!normalizedTemplate) {
			throw new Error("Template must be a JSON object.");
		}

		const existingIndex = findTemplateIndex(store.templates, normalizedTemplate);
		const templates =
			existingIndex >= 0
				? store.templates.map((current, index) =>
					index === existingIndex
						? { ...normalizedTemplate, id: current.id || normalizedTemplate.id }
						: current,
				)
				: [...store.templates, normalizedTemplate];
		const nextStore = normalizeTemplateStoreData({
			...store,
			templates,
		});

		await this.writeStore(nextStore);
		return nextStore.templates[existingIndex >= 0 ? existingIndex : nextStore.templates.length - 1];
	}

	public async deleteTemplate(id: string): Promise<void> {
		const store = await this.readStore();
		const templates = store.templates.filter(template => String(template.id) !== id);
		await this.writeStore({
			...store,
			templates,
		});
	}

	private async resolveTemplateResource(): Promise<URI> {
		const environment = await this.nativeHostService.getEnvironment();
		return URI.joinPath(getAppSettingsHome(environment.userDataPath ?? ""), TEMPLATE_FILENAME);
	}

	private async readStore(): Promise<TemplateStoreData> {
		const resource = await this.resource;
		if (!await this.fileService.exists(resource)) {
			const store = buildDefaultTemplateStoreData();
			await this.writeStore(store);
			return store;
		}

		const content = await this.fileService.readFile(resource, { encoding: "utf8" });
		const normalized = normalizeTemplateStoreDataWithMetadata(JSON.parse(content.value || "{}"));
		if (normalized.didChange) {
			await this.writeStore(normalized.data);
		}
		return normalized.data;
	}

	private async writeStore(store: TemplateStoreData): Promise<void> {
		await this.jsonEditingService.write(
			await this.resource,
			[{ path: [], value: normalizeTemplateStoreData(store) }],
			true,
		);
	}
}

function findTemplateIndex(templates: readonly StoredTemplate[], template: StoredTemplate): number {
	const templateId = String(template.id || "");
	if (templateId) {
		const idIndex = templates.findIndex(current => String(current.id || "") === templateId);
		if (idIndex >= 0) {
			return idIndex;
		}
	}

	const templateName = toTemplateNameKey(template.name);
	if (templateName) {
		return templates.findIndex(current => toTemplateNameKey(current.name) === templateName);
	}

	return -1;
}

registerSingleton(ITemplateStoreService, ElectronTemplateStoreService, InstantiationType.Delayed);
