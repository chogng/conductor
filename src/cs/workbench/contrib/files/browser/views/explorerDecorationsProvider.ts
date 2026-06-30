/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from "src/cs/base/common/async";
import { Emitter, type Event } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import { URI } from "src/cs/base/common/uri";
import type { CancellationToken } from "src/cs/base/common/cancellation";
import { localize } from "src/cs/nls";
import {
	IExplorerService,
	type IExplorerService as IExplorerServiceType,
} from "src/cs/workbench/contrib/files/browser/files";
import type { ExplorerFileEntry } from "src/cs/workbench/contrib/files/common/explorerModel";
import {
	IReviewService,
	type IReviewService as IReviewServiceType,
} from "src/cs/workbench/services/review/common/review";
import type { ReviewSummary } from "src/cs/workbench/services/review/common/reviewModel";
import type { IDecorationData, IDecorationsProvider } from "src/cs/workbench/services/decorations/common/decorations";

const ExplorerDecorationReviewChangeDelayMs = 250;

export class ExplorerDecorationsProvider extends Disposable implements IDecorationsProvider {
	public readonly label = localize("files.decorations.providerLabel", "Explorer");

	private readonly onDidChangeEmitter = this._register(new Emitter<readonly URI[]>());
	public readonly onDidChange: Event<readonly URI[]> = this.onDidChangeEmitter.event;
	private readonly reviewChangeScheduler = this._register(new RunOnceScheduler(
		() => this.fireAllResourceDecorationsChanged(),
		ExplorerDecorationReviewChangeDelayMs,
	));

	public constructor(
		@IExplorerService private readonly explorerService: IExplorerServiceType,
		@IReviewService private readonly reviewService: IReviewServiceType,
	) {
		super();
		this._register(this.explorerService.onDidChangePaneInput(() => {
			this.fireAllResourceDecorationsChanged();
		}));
		this._register(this.reviewService.onDidChangeReview(() => {
			this.reviewChangeScheduler.schedule();
		}));
	}

	public provideDecorations(
		resource: URI,
		_token?: CancellationToken,
	): IDecorationData | undefined {
		const target = parseExplorerDecorationResource(resource);
		if (!this.hasExplorerEntryForDecorationTarget(target)) {
			return undefined;
		}

		const summary = this.reviewService.getLatestReviewSummary({
			resource: target.resource,
			sheetId: target.sheetId,
		});
		return createExplorerDecorationDataFromReviewSummary(summary);
	}

	private fireAllResourceDecorationsChanged(): void {
		const resources = this.getExplorerResources();
		if (resources.length) {
			this.onDidChangeEmitter.fire(resources);
		}
	}

	private getExplorerResources(): readonly URI[] {
		const resources: URI[] = [];
		const seen = new Set<string>();
		for (const entry of this.getExplorerEntries()) {
			const resource = getExplorerEntryDecorationResource(entry);
			if (!resource) {
				continue;
			}
			const decorationResource = createExplorerDecorationResource(resource, entry.sheetId);
			const identity = normalizeResourceKey(decorationResource);
			if (!identity || seen.has(identity)) {
				continue;
			}
			seen.add(identity);
			resources.push(decorationResource);
		}
		return resources;
	}

	private getExplorerEntries(): readonly ExplorerFileEntry[] {
		return this.explorerService.files;
	}

	private hasExplorerEntryForDecorationTarget(target: ExplorerDecorationTarget): boolean {
		const resourceKey = normalizeResourceKey(target.resource);
		if (!resourceKey) {
			return false;
		}

		return this.getExplorerEntries().some(entry => {
			const entryResource = getExplorerEntryDecorationResource(entry);
			if (normalizeResourceKey(entryResource) !== resourceKey) {
				return false;
			}
			return target.sheetId
				? String(entry.sheetId ?? "").trim() === target.sheetId
				: true;
		});
	}
}

const normalizeResourceKey = (
	resource: URI | null | undefined,
): string => resource?.toString().trim().replace(/\\/g, "/") ?? "";

const getExplorerEntryDecorationResource = (
	entry: ExplorerFileEntry,
): URI | null => {
	const resource = entry.resource ? URI.revive(entry.resource) : null;
	return resource ?? null;
};

const SheetFragmentPrefix = "conductor.sheetId=";

export const createExplorerDecorationResource = (
	resource: URI,
	sheetId?: ExplorerFileEntry["sheetId"],
): URI => {
	const normalizedSheetId = String(sheetId ?? "").trim();
	return normalizedSheetId
		? resource.with({ fragment: `${SheetFragmentPrefix}${encodeURIComponent(normalizedSheetId)}` })
		: resource;
};

type ExplorerDecorationTarget = {
	readonly resource: URI;
	readonly sheetId: string | null;
};

const parseExplorerDecorationResource = (
	resource: URI,
): ExplorerDecorationTarget => {
	const fragment = String(resource.fragment ?? "");
	if (!fragment.startsWith(SheetFragmentPrefix)) {
		return { resource, sheetId: null };
	}

	const encodedSheetId = fragment.slice(SheetFragmentPrefix.length);
	return {
		resource: resource.with({ fragment: "" }),
		sheetId: decodeURIComponent(encodedSheetId),
	};
};

export const createExplorerDecorationDataFromReviewSummary = (
	summary: ReviewSummary | undefined,
): IDecorationData | undefined => {
	if (!summary) {
		return undefined;
	}

	switch (summary.state) {
		case "missing":
			return undefined;
		case "pending":
			return {
				letter: "...",
				tooltip: localize("files.decorations.reviewPending", "Review pending."),
			};
		case "stale":
			return {
				color: "charts.orange",
				letter: "!",
				tooltip: summary.message ?? localize("files.decorations.reviewStale", "Review is stale."),
			};
		case "ready":
			return {
				letter: getReviewSummaryBadgeLetter(summary),
				tooltip: summary.message ?? localize("files.decorations.reviewReady", "Review ready."),
			};
		case "needsAdjustment":
			return {
				color: "charts.orange",
				letter: "?",
				tooltip: summary.message ?? localize("files.decorations.reviewNeedsAdjustment", "Review needs adjustment."),
			};
		case "invalid":
			return {
				color: "charts.red",
				letter: "!",
				tooltip: summary.message ?? localize("files.decorations.reviewInvalid", "Review invalid."),
			};
	}
};

const getReviewSummaryBadgeLetter = (
	summary: ReviewSummary,
): string => {
	const label = String(summary.reviewedSemanticLabel ?? "").trim();
	return label || localize("files.decorations.reviewBadge", "Review");
};
