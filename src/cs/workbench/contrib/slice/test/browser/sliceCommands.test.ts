/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { Event } from "src/cs/base/common/event";
import { URI } from "src/cs/base/common/uri";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import type { ServicesAccessor, ServiceIdentifier } from "src/cs/platform/instantiation/common/instantiation";
import { IExplorerService } from "src/cs/workbench/contrib/files/browser/files";
import {
	runSliceWithTemplateHandler,
} from "src/cs/workbench/contrib/slice/browser/sliceCommands";
import {
	INotificationService,
	type INotification,
} from "src/cs/workbench/services/notification/common/notificationService";
import {
	IReviewService,
	type IReviewService as IReviewServiceType,
	type UriReviewExecution,
} from "src/cs/workbench/services/review/common/review";
import type { ReviewedTemplate } from "src/cs/workbench/services/review/common/reviewModel";
import {
	IWorkbenchLayoutService,
} from "src/cs/workbench/services/layout/browser/layoutService";
import {
	ISliceService,
	type SliceState,
	type SliceUriRequest,
	type SliceUriTarget,
} from "src/cs/workbench/services/slice/common/slice";
import { createEmptyTemplateEditorConfig } from "src/cs/workbench/services/template/common/templateEditorConfig";
import type { Template } from "src/cs/workbench/services/template/common/template";
import {
	type TemplateState,
	ITemplateViewStateService,
} from "src/cs/workbench/contrib/template/browser/templateViewStateService";
import type { TemplateSelection } from "src/cs/workbench/services/slice/common/templateSelection";
import { createTemplateFingerprint } from "src/cs/workbench/services/template/common/templateFingerprint";
import {
	IUserTemplateService,
	type IUserTemplateService as IUserTemplateServiceType,
	type UserTemplate,
	type UserTemplateChangeEvent,
} from "src/cs/workbench/services/userTemplate/common/userTemplate";

suite("workbench/contrib/slice/test/browser/sliceCommands", () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test("does not enter raw-table auto slicing from bulk apply", () => {
		const sliceService = new TestSliceService();
		const notifications: INotification[] = [];

		runSliceWithTemplateHandler(createAccessor({
			notifications,
			sliceService,
			templateState: createTemplateState({
				selectedTemplateId: null,
			}),
		}));

		assert.deepEqual(sliceService.uriRequests, []);
		assert.equal(notifications[0]?.id, "slice.notification");
		assert.equal(notifications[0]?.message, "slice.runWithTemplate.noUriTables");
	});

	test("does not submit manual slicing without URI content targets from the selected saved template", () => {
		const sliceService = new TestSliceService();
		const notifications: INotification[] = [];

		runSliceWithTemplateHandler(createAccessor({
			notifications,
			sliceService,
			templateState: createTemplateState({
				selectedTemplateId: "template-a",
				formState: createEmptyTemplateEditorConfig({
					name: "Template A",
					xColumns: [0],
					xDataStart: "A2",
					xDataEnd: "A3",
					yColumns: [1],
				}),
			}),
		}));

		assert.deepEqual(sliceService.uriRequests, []);
		assert.equal(notifications[0]?.id, "slice.notification");
		assert.equal(notifications[0]?.message, "slice.runWithTemplate.noUriTables");
	});

	test("does not run while explorer has pending sources", () => {
		const sliceService = new TestSliceService();
		const notifications: INotification[] = [];

		runSliceWithTemplateHandler(createAccessor({
			hasPendingSourceFiles: true,
			notifications,
			sliceService,
		}));

		assert.deepEqual(sliceService.uriRequests, []);
		assert.equal(notifications[0]?.id, "slice.notification");
	});

	test("submits URI slice requests with a source content signature", async () => {
		const sliceService = new TestSliceService();
		const resource = URI.file("/workspace/transfer.csv");
		const reviewedTemplate = createReviewedTemplate();
		const reviewSignature = "review:ready";
		const confirmations: Parameters<IReviewServiceType["confirmReviewedTemplate"]>[0][] = [];

		runSliceWithTemplateHandler(createAccessor({
			explorerFiles: [{
				fileId: "file-a",
				id: "file-a",
				name: "transfer.csv",
				resource,
				sheetId: "sheet-a",
			}],
			reviewService: createReviewServiceForTest({
				reviewUriForExecution: async target => createReadyUriExecution({
					applicationKind: "systemRecommended",
					reviewedTemplate,
					reviewSignature,
					sourceModelVersion: 7,
					sourceVersion: 11,
					target,
				}),
				confirmReviewedTemplate: async input => {
					confirmations.push(input);
					return null;
				},
			}),
			sliceService,
			templateState: createTemplateState({
				selectedTemplateId: null,
			}),
		}));

		await waitForMicrotasks();

		const request = sliceService.uriRequests[0];
		assert.ok(request);
		assert.equal(request.target.resource.toString(), resource.toString());
		assert.equal(request.target.sheetId, "sheet-a");
		assert.notEqual(request.sourceContentSignature, request.requestSignature);
		assert.match(request.sourceContentSignature, /transfer\.csv/);
		assert.match(request.sourceContentSignature, /"sourceModelVersion":7/);
		assert.match(request.sourceContentSignature, /"sheetId":"sheet-a"/);
		assert.match(request.sourceContentSignature, /"sourceVersion":11/);
		assert.match(request.sourceContentSignature, /review:ready/);
		assert.equal(JSON.parse(request.sourceContentSignature).sourceRawTableVersion, undefined);
		assert.deepEqual(confirmations, []);
	});

	test("confirms manual URI reviewed templates before submitting slice requests", async () => {
		const sliceService = new TestSliceService();
		const resource = URI.file("/workspace/transfer.csv");
		const reviewedTemplate = createReviewedTemplate();
		const confirmations: Parameters<IReviewServiceType["confirmReviewedTemplate"]>[0][] = [];

		runSliceWithTemplateHandler(createAccessor({
			explorerFiles: [{
				fileId: "file-a",
				id: "file-a",
				name: "transfer.csv",
				resource,
				sheetId: "sheet-a",
			}],
			reviewService: createReviewServiceForTest({
				reviewUriForExecution: async target => createReadyUriExecution({
					applicationKind: "userActionRequired",
					reviewedTemplate,
					reviewSignature: "review:manual",
					target,
				}),
				reviewUriManualTemplate: async () => ({
					kind: "ready",
					reviewedTemplate,
					suggestedActions: [],
				}),
				confirmReviewedTemplate: async input => {
					confirmations.push(input);
					return null;
				},
			}),
			sliceService,
			templateState: createTemplateState({
				selectedTemplateId: "template-a",
				formState: createEmptyTemplateEditorConfig({
					name: "Template A",
					xColumns: [0],
					xDataStart: "A2",
					xDataEnd: "A3",
					yColumns: [1],
				}),
			}),
		}));

		await waitForMicrotasks();

		assert.equal(sliceService.uriRequests.length, 1);
		assert.equal(confirmations.length, 1);
		assert.equal(confirmations[0]?.target.resource.toString(), resource.toString());
		assert.equal(confirmations[0]?.target.sheetId, "sheet-a");
		assert.equal(confirmations[0]?.reviewedTemplate, reviewedTemplate);
		assert.equal(confirmations[0]?.reason, "user");
	});

	test("does not block manual URI slicing when schema profile confirmation fails", async () => {
		const sliceService = new TestSliceService();
		const resource = URI.file("/workspace/transfer.csv");
		const reviewedTemplate = createReviewedTemplate();

		runSliceWithTemplateHandler(createAccessor({
			explorerFiles: [{
				fileId: "file-a",
				id: "file-a",
				name: "transfer.csv",
				resource,
				sheetId: "sheet-a",
			}],
			reviewService: createReviewServiceForTest({
				reviewUriForExecution: async target => createReadyUriExecution({
					applicationKind: "userActionRequired",
					reviewedTemplate,
					reviewSignature: "review:manual",
					target,
				}),
				reviewUriManualTemplate: async () => ({
					kind: "ready",
					reviewedTemplate,
					suggestedActions: [],
				}),
				confirmReviewedTemplate: async () => {
					throw new Error("confirmation failed");
				},
			}),
			sliceService,
			templateState: createTemplateState({
				selectedTemplateId: "template-a",
				formState: createEmptyTemplateEditorConfig({
					name: "Template A",
					xColumns: [0],
					xDataStart: "A2",
					xDataEnd: "A3",
					yColumns: [1],
				}),
			}),
		}));

		await waitForMicrotasks();

		assert.equal(sliceService.uriRequests.length, 1);
	});

	test("does not submit URI auto slice when review needs user action", async () => {
		const sliceService = new TestSliceService();
		const resource = URI.file("/workspace/transfer.csv");
		const reviewedTemplate = createReviewedTemplate();

		runSliceWithTemplateHandler(createAccessor({
			explorerFiles: [{
				fileId: "file-a",
				id: "file-a",
				name: "transfer.csv",
				resource,
				sheetId: "sheet-a",
			}],
			reviewService: createReviewServiceForTest({
				reviewUriForExecution: async target => createReadyUriExecution({
					applicationKind: "userActionRequired",
					reviewedTemplate,
					reviewSignature: "review:user-action",
					target,
				}),
			}),
			sliceService,
			templateState: createTemplateState({
				selectedTemplateId: null,
			}),
		}));

		await waitForMicrotasks();

		assert.deepEqual(sliceService.uriRequests, []);
	});

	test("does not submit URI slice requests without a review signature", async () => {
		const sliceService = new TestSliceService();
		const resource = URI.file("/workspace/transfer.csv");
		const reviewedTemplate = createReviewedTemplate();
		const notifications: INotification[] = [];

		runSliceWithTemplateHandler(createAccessor({
			explorerFiles: [{
				fileId: "file-a",
				id: "file-a",
				name: "transfer.csv",
				resource,
				sheetId: "sheet-a",
			}],
			notifications,
			reviewService: createReviewServiceForTest({
				reviewUriForExecution: async () => null,
			}),
			sliceService,
			templateState: createTemplateState({
				selectedTemplateId: null,
			}),
		}));

		await waitForMicrotasks();

		assert.deepEqual(sliceService.uriRequests, []);
		assert.equal(notifications[0]?.id, "slice.notification");
	});
});

class TestSliceService implements ISliceService {
	public declare readonly _serviceBrand: undefined;
	public readonly onDidChangeSliceState = Event.None as Event<void>;
	public readonly onDidChangeUriSliceResult = Event.None as Event<SliceUriTarget>;
	public readonly uriRequests: SliceUriRequest[] = [];

	public getState(): SliceState {
		return {
			activeFileId: null,
			fileStates: new Map(),
			queueLength: 0,
			templateSelectionsByFileId: {},
		};
	}

	public getUriResult(): null {
		return null;
	}

	public getUriState(): undefined {
		return undefined;
	}

	public submitUri(requests: readonly SliceUriRequest[]): void {
		this.uriRequests.push(...requests);
	}
	public prioritizeUri(_target: SliceUriTarget): void {}
	public cancel(_fileIds?: readonly string[]): void {}
	public cancelUri(_targets: readonly SliceUriTarget[]): void {}
	public setTemplateSelection(_fileId: string, _selection: TemplateSelection): void {}
}

const createAccessor = ({
	explorerFiles = [],
	hasPendingSourceFiles = false,
	notifications = [],
	reviewService = createReviewServiceForTest(),
	sliceService,
	templateState = createTemplateState(),
	userTemplateService = createUserTemplateServiceForTest(),
}: {
	readonly explorerFiles?: readonly unknown[];
	readonly hasPendingSourceFiles?: boolean;
	readonly notifications?: INotification[];
	readonly reviewService?: IReviewServiceType;
	readonly sliceService: ISliceService;
	readonly templateState?: TemplateState;
	readonly userTemplateService?: IUserTemplateServiceType;
}): ServicesAccessor => {
	const services = new Map<ServiceIdentifier<unknown>, unknown>([
		[IExplorerService, {
			_serviceBrand: undefined,
			getPaneInput: () => ({ files: explorerFiles, quickAccessFiles: [] }),
			hasPendingSourceFiles,
		}],
		[INotificationService, {
			_serviceBrand: undefined,
			notify: (notification: INotification) => {
				notifications.push(notification);
			},
		}],
		[IReviewService, reviewService],
		[ISliceService, sliceService],
		[IWorkbenchLayoutService, {
			_serviceBrand: undefined,
			navigateToView: () => undefined,
		}],
		[ITemplateViewStateService, createTemplateViewStateService(templateState)],
		[IUserTemplateService, userTemplateService],
	]);
	return {
		get: <T>(id: ServiceIdentifier<T>): T =>
			services.get(id as ServiceIdentifier<unknown>) as T,
	};
};

const createTemplateViewStateService = (state: TemplateState): ITemplateViewStateService => ({
	_serviceBrand: undefined,
	cancelTemplateEditor: () => undefined,
	createTemplateDraft: () => undefined,
	editTemplate: () => false,
	finishTemplateEditor: () => undefined,
	getState: () => state,
	onDidChangeTemplateState: Event.None as Event<TemplateState>,
	selectTemplate: () => false,
	setFormState: () => undefined,
});

const createUserTemplateServiceForTest = (
	templates: readonly UserTemplate[] = [createUserTemplate("template-a")],
): IUserTemplateServiceType => ({
	_serviceBrand: undefined,
	createTemplate: async () => {
		throw new Error("Unexpected user template create in slice command test.");
	},
	deleteTemplate: async () => undefined,
	duplicateTemplate: async () => {
		throw new Error("Unexpected user template duplicate in slice command test.");
	},
	exportTemplates: () => ({
		version: 1,
		source: "conductor.userTemplate",
		templates,
	}),
	getSnapshot: () => ({
		version: 1,
		workspaceVersion: 1,
		profileVersion: 0,
		workspaceFingerprint: "workspace",
		profileFingerprint: "",
		effectiveFingerprint: "workspace",
		templates,
	}),
	getTemplate: id => templates.find(template => template.id === id),
	importTemplates: async () => ({
		imported: [],
		skipped: [],
	}),
	onDidChangeUserTemplates: Event.None as Event<UserTemplateChangeEvent>,
	refreshTemplates: async () => templates,
	updateTemplate: async () => {
		throw new Error("Unexpected user template update in slice command test.");
	},
});

const createReviewServiceForTest = (
	overrides: Partial<IReviewServiceType> = {},
): IReviewServiceType => ({
	_serviceBrand: undefined,
	getLatestReviewSummary: target => ({
		resource: target.resource,
		...(target.sheetId ? { sheetId: target.sheetId } : {}),
		state: "missing",
		findingCodes: [],
	}),
	onDidChangeReview: Event.None as Event<void>,
	confirmReviewedTemplate: async () => null,
	reviewUriManualTemplate: async () => ({
		kind: "invalid",
		diagnostics: [],
		suggestedActions: [],
	}),
	reviewUriForExecution: async () => null,
	...overrides,
});

const createReadyUriExecution = ({
	applicationKind,
	reviewedTemplate,
	reviewSignature,
	sourceModelVersion = 7,
	sourceVersion = 11,
	target,
}: {
	readonly applicationKind: "systemRecommended" | "userActionRequired";
	readonly reviewedTemplate: ReviewedTemplate;
	readonly reviewSignature: string;
	readonly sourceModelVersion?: number;
	readonly sourceVersion?: number;
	readonly target: { readonly resource: URI; readonly sheetId?: string | null };
}): UriReviewExecution => ({
	resource: target.resource,
	...(target.sheetId ? { sheetId: target.sheetId } : {}),
	summary: {
		resource: target.resource,
		...(target.sheetId ? { sheetId: target.sheetId } : {}),
		state: "ready",
		findingCodes: [],
	},
	reviewSignature,
	sourceModelVersion,
	sourceVersion,
	rowCount: 3,
	columnCount: 2,
	...(applicationKind === "systemRecommended" ? { systemRecommendedReviewedTemplate: reviewedTemplate } : {}),
});

const createTemplateState = (overrides: Partial<TemplateState> = {}): TemplateState => ({
	formState: createEmptyTemplateEditorConfig(),
	mode: "management",
	selectedTemplateId: null,
	...overrides,
});

const createReviewedTemplate = (): ReviewedTemplate => {
	const template: Template = {
		schemaVersion: 1,
		name: "Detected IV Transfer",
		version: 1,
		measurement: {
			curveFamily: "iv",
			ivMode: "transfer",
		},
		blocks: [{
			rowRange: {
				startRow: 1,
				endRow: 2,
			},
			x: {
				columns: [0],
				unit: "V",
			},
			y: {
				columns: [1],
				unit: "A",
			},
			segmentation: {
				kind: "auto" as const,
			},
			legend: {
				target: "auto" as const,
			},
		}],
		stopOnError: false,
	};
	const templateFingerprint = createTemplateFingerprint(template);
	return {
		candidateId: "candidate:iv-transfer",
		source: {
			kind: "builtin",
			recipeId: "builtin.iv.transfer",
			recipeVersion: 1,
		},
		template,
		templateFingerprint,
		review: {
			candidateId: "candidate:iv-transfer",
			interpretationFingerprint: templateFingerprint,
			status: "ready",
			confidence: 1,
			factors: {
				selectorScore: 1,
				projectionScore: 1,
				semanticScore: 1,
				dataQualityScore: 1,
				parseHealthScore: 1,
				freshnessScore: 1,
				ambiguityPenalty: 0,
				conflictPenalty: 0,
				diagnosticPenalty: 0,
			},
			findings: [],
			reasons: [],
			diagnostics: [],
		},
	};
};

const createUserTemplate = (
	id: string,
): UserTemplate => {
	const template = createReviewedTemplate().template;
	return {
		id,
		name: "Template A",
		version: 1,
		scope: "workspace",
		source: "userCreated",
		template,
		templateFingerprint: createTemplateFingerprint(template),
		createdAt: 1,
		updatedAt: 1,
	};
};

const waitForMicrotasks = async (): Promise<void> => {
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();
};
