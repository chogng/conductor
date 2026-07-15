/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, type Event } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import { URI } from "src/cs/base/common/uri";
import type { CancellationToken } from "src/cs/base/common/cancellation";
import { localize } from "src/cs/nls";
import {
	registerWorkbenchContribution2,
	WorkbenchPhase,
	type IWorkbenchContribution,
} from "src/cs/workbench/common/contributions";
import {
	IExplorerService,
	type IExplorerService as IExplorerServiceType,
} from "src/cs/workbench/contrib/files/browser/files";
import type { ExplorerFileEntry } from "src/cs/workbench/contrib/files/common/explorerModel";
import {
	IReviewService,
	type IReviewService as IReviewServiceType,
} from "src/cs/workbench/services/review/common/review";
import type { ReviewSummary, ReviewSummaryTarget } from "src/cs/workbench/services/review/common/reviewModel";
import {
	IDecorationsService,
	type IDecorationData,
	type IDecorationsProvider,
} from "src/cs/workbench/services/decorations/common/decorations";

const ExplorerDecorationsContributionId = "workbench.contrib.files.explorerDecorations";

export class ExplorerDecorationsProvider extends Disposable implements IDecorationsProvider {
	public readonly label = localize("files.decorations.providerLabel", "Explorer");

	private readonly onDidChangeEmitter = this._register(new Emitter<readonly URI[]>());
	public readonly onDidChange: Event<readonly URI[]> = this.onDidChangeEmitter.event;

	public constructor(
		@IExplorerService private readonly explorerService: IExplorerServiceType,
		@IReviewService private readonly reviewService: IReviewServiceType,
	) {
		super();
		this._register(this.explorerService.onDidChangeFiles(() => {
			this.fireAllResourceDecorationsChanged();
		}));
		this._register(this.reviewService.onDidChangeReview(targets => {
			this.fireReviewDecorationsChanged(targets);
		}));
	}

	public provideDecorations(
		resource: URI,
		_token?: CancellationToken,
	): IDecorationData | undefined {
		const target = parseExplorerDecorationResource(resource);
		if (!target || !this.hasExplorerEntryForDecorationTarget(target)) {
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

	private fireReviewDecorationsChanged(targets: readonly ReviewSummaryTarget[]): void {
		const resources = this.getExplorerResources(targets);
		if (resources.length) {
			this.onDidChangeEmitter.fire(resources);
		}
	}

	private getExplorerResources(
		targets?: readonly ReviewSummaryTarget[],
	): readonly URI[] {
		const resources: URI[] = [];
		const seen = new Set<string>();
		const targetIndex = targets ? createReviewTargetIndex(targets) : null;
		for (const entry of this.getExplorerEntries()) {
			const resource = getExplorerEntryDecorationResource(entry);
			if (!resource) {
				continue;
			}
			if (targetIndex && !isExplorerEntryReviewTarget(entry, resource, targetIndex)) {
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

type ReviewTargetIndex = ReadonlyMap<string, ReadonlySet<string> | null>;

const createReviewTargetIndex = (
	targets: readonly ReviewSummaryTarget[],
): ReviewTargetIndex => {
	const index = new Map<string, Set<string> | null>();
	for (const target of targets) {
		const resourceKey = normalizeResourceKey(target.resource);
		if (!resourceKey || index.get(resourceKey) === null) {
			continue;
		}
		const sheetId = String(target.sheetId ?? "").trim();
		if (!sheetId) {
			index.set(resourceKey, null);
			continue;
		}
		let sheetIds = index.get(resourceKey);
		if (!sheetIds) {
			sheetIds = new Set<string>();
			index.set(resourceKey, sheetIds);
		}
		sheetIds.add(sheetId);
	}
	return index;
};

const isExplorerEntryReviewTarget = (
	entry: ExplorerFileEntry,
	resource: URI,
	targetIndex: ReviewTargetIndex,
): boolean => {
	const sheetIds = targetIndex.get(normalizeResourceKey(resource));
	if (sheetIds === undefined) {
		return false;
	}
	return sheetIds === null || sheetIds.has(String(entry.sheetId ?? "").trim());
};

type ExplorerDecorationResourcePayload = {
	readonly resourceFragment: string;
	readonly sheetId: string | null;
};

const ExplorerDecorationFragmentPrefix = "conductor.explorerDecoration=";

// Decoration adapter boundary: IDecorationsProvider is URI-only, while Explorer
// review decorations are sheet-row scoped. Keep this fragment private to the
// decoration provider and delete it when decorations support resource/sheet keys.
export const createExplorerDecorationResource = (
	resource: URI,
	sheetId?: ExplorerFileEntry["sheetId"],
): URI => {
	const normalizedSheetId = String(sheetId ?? "").trim();
	const payload: ExplorerDecorationResourcePayload = {
		resourceFragment: resource.fragment,
		sheetId: normalizedSheetId || null,
	};
	return resource.with({
		fragment: `${ExplorerDecorationFragmentPrefix}${encodeURIComponent(JSON.stringify(payload))}`,
	});
};

type ExplorerDecorationTarget = {
	readonly resource: URI;
	readonly sheetId: string | null;
};

const parseExplorerDecorationResource = (
	resource: URI,
): ExplorerDecorationTarget | null => {
	const fragment = String(resource.fragment ?? "");
	if (!fragment.startsWith(ExplorerDecorationFragmentPrefix)) {
		return null;
	}

	try {
		const payload = JSON.parse(decodeURIComponent(
			fragment.slice(ExplorerDecorationFragmentPrefix.length),
		)) as Partial<ExplorerDecorationResourcePayload> | null;
		if (!payload ||
			typeof payload.resourceFragment !== "string" ||
			(payload.sheetId !== null && typeof payload.sheetId !== "string")) {
			return null;
		}

		const sheetId = String(payload.sheetId ?? "").trim();
		return {
			resource: resource.with({ fragment: payload.resourceFragment }),
			sheetId: sheetId || null,
		};
	} catch {
		return null;
	}
};

class ExplorerDecorationsContribution extends Disposable implements IWorkbenchContribution {
	public constructor(
		@IDecorationsService decorationsService: IDecorationsService,
		@IExplorerService explorerService: IExplorerServiceType,
		@IReviewService reviewService: IReviewServiceType,
	) {
		super();
		const provider = this._register(new ExplorerDecorationsProvider(explorerService, reviewService));
		this._register(decorationsService.registerDecorationsProvider(provider));
	}
}

registerWorkbenchContribution2(
	ExplorerDecorationsContributionId,
	ExplorerDecorationsContribution,
	WorkbenchPhase.BlockStartup,
);

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
			return createReadyReviewDecorationData(summary);
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

const createReadyReviewDecorationData = (
	summary: ReviewSummary,
): IDecorationData | undefined => {
	const reviewedType = String(summary.reviewedType ?? "").trim();
	if (!reviewedType) {
		return undefined;
	}
	return {
		letter: reviewedType,
		tooltip: summary.reviewedSemanticLabel ?? summary.message ?? localize("files.decorations.reviewReady", "Review ready."),
	};
};
