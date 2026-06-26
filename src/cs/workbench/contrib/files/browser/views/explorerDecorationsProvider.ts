/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, type Event } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import type { URI } from "src/cs/base/common/uri";
import { localize } from "src/cs/nls";
import {
	IExplorerService,
	type IExplorerService as IExplorerServiceType,
} from "src/cs/workbench/contrib/files/browser/files";
import type { ExplorerFileEntry } from "src/cs/workbench/contrib/files/common/explorerModel";
import {
	createExplorerDecorationDataFromReviewSummary,
	type ExplorerDecorationData,
} from "src/cs/workbench/contrib/files/browser/views/explorerDecorations";
import {
	IReviewService,
	type IReviewService as IReviewServiceType,
} from "src/cs/workbench/services/review/common/review";

export class ExplorerDecorationsProvider extends Disposable {
	public readonly label = localize("files.decorations.providerLabel", "Explorer");

	private readonly onDidChangeEmitter = this._register(new Emitter<readonly URI[]>());
	public readonly onDidChange: Event<readonly URI[]> = this.onDidChangeEmitter.event;

	public constructor(
		@IExplorerService private readonly explorerService: IExplorerServiceType,
		@IReviewService private readonly reviewService: IReviewServiceType,
	) {
		super();
		this._register(this.explorerService.onDidChangePaneInput(() => {
			this.fireAllResourceDecorationsChanged();
		}));
		this._register(this.reviewService.onDidChangeReviewState(() => {
			this.fireAllResourceDecorationsChanged();
		}));
	}

	public provideDecorations(
		resource: URI,
		sheetId?: ExplorerFileEntry["sheetId"],
	): ExplorerDecorationData | undefined {
		const entry = this.findExplorerEntry(resource);
		const summary = this.reviewService.getLatestReviewSummary({
			resource,
			sheetId: sheetId ?? entry?.sheetId ?? null,
		});
		return createExplorerDecorationDataFromReviewSummary(summary);
	}

	private fireAllResourceDecorationsChanged(): void {
		const resources = this.getExplorerResources();
		if (resources.length) {
			this.onDidChangeEmitter.fire(resources);
		}
	}

	private findExplorerEntry(resource: URI): ExplorerFileEntry | undefined {
		const resourceKey = normalizeResourceKey(resource);
		return this.getExplorerEntries()
			.find(entry => normalizeResourceKey(entry.resource) === resourceKey);
	}

	private getExplorerResources(): readonly URI[] {
		const resources: URI[] = [];
		const seen = new Set<string>();
		for (const entry of this.getExplorerEntries()) {
			if (!entry.resource) {
				continue;
			}
			const key = normalizeResourceKey(entry.resource);
			if (!key || seen.has(key)) {
				continue;
			}
			seen.add(key);
			resources.push(entry.resource);
		}
		return resources;
	}

	private getExplorerEntries(): readonly ExplorerFileEntry[] {
		const input = this.explorerService.getPaneInput();
		return [
			...(input?.files ?? []),
			...(input?.quickAccessFiles ?? []),
		];
	}
}

const normalizeResourceKey = (
	resource: URI | null | undefined,
): string => resource?.toString().trim().replace(/\\/g, "/") ?? "";
