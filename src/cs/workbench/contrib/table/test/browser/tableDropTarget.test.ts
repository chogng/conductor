/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import { TableDropTarget } from "src/cs/workbench/contrib/table/browser/tableDropTarget";
import {
	NotificationService,
} from "src/cs/workbench/services/notification/common/notificationService";
import {
	type ITableService as ITableServiceType,
} from "src/cs/workbench/services/table/common/table";
import type {
	ITableModelService,
} from "src/cs/workbench/services/table/common/resolverService";

suite("workbench/contrib/table/test/browser/tableDropTarget", () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test("accepts dragover on the table center-area target", () => {
		const tableTarget = createTestElement();
		const dropTarget = store.add(new TableDropTarget(
			tableTarget,
			store.add(new NotificationService()),
			createTableService(),
			createTableModelService(),
		));

		try {
			assertDragOverAccepted(tableTarget);
		} finally {
			dropTarget.dispose();
		}
	});

	test("clears dragging state on dispose", () => {
		const tableTarget = createTestElement();
		const dropTarget = new TableDropTarget(
			tableTarget,
			store.add(new NotificationService()),
			createTableService(),
			createTableModelService(),
		);

		dispatchDragEvent(tableTarget, "dragenter");
		assert.equal(tableTarget.classList.contains("workbench_center_area_shell--dragging"), true);

		dropTarget.dispose();
		assert.equal(tableTarget.classList.contains("workbench_center_area_shell--dragging"), false);
	});
});

function assertDragOverAccepted(target: HTMLElement): void {
	const dragEnter = dispatchDragEvent(target, "dragenter");
	assert.equal(dragEnter.defaultPrevented, true);
	assert.equal(dragEnter.dataTransfer?.dropEffect, "copy");

	const event = dispatchDragEvent(target, "dragover");
	assert.equal(event.defaultPrevented, true);
	assert.equal(event.dataTransfer?.dropEffect, "copy");
	assert.equal(target.classList.contains("workbench_center_area_shell--dragging"), true);

	target.dispatchEvent(new globalThis.Event("dragleave"));
	assert.equal(target.classList.contains("workbench_center_area_shell--dragging"), false);
}

function dispatchDragEvent(target: HTMLElement, type: string): DragEvent {
	const event = new globalThis.Event(type, {
		bubbles: true,
		cancelable: true,
	}) as DragEvent;
	Object.defineProperty(event, "dataTransfer", {
		value: createDataTransfer(),
	});
	target.dispatchEvent(event);
	return event;
}

function createDataTransfer(): DataTransfer {
	return {
		dropEffect: "none",
	} as DataTransfer;
}

class TestElement extends EventTarget {
	public readonly classList = new TestClassList();
}

class TestClassList {
	private readonly tokens = new Set<string>();

	public contains(token: string): boolean {
		return this.tokens.has(token);
	}

	public toggle(token: string, force?: boolean): boolean {
		const shouldHaveToken = force ?? !this.tokens.has(token);
		if (shouldHaveToken) {
			this.tokens.add(token);
			return true;
		}

		this.tokens.delete(token);
		return false;
	}
}

function createTestElement(): HTMLElement {
	return new TestElement() as unknown as HTMLElement;
}

function createTableService(): ITableServiceType {
	return {
		_serviceBrand: undefined,
		onDidChangeSelection: () => ({ dispose: () => undefined }),
		onDidChangeTableViewInput: () => ({ dispose: () => undefined }),
		adjustColumnDisplayScale: () => false,
		clearHighlight: () => undefined,
		clearSelection: () => false,
		getColumnWidths: () => [],
		getPreviewRow: () => null,
		getSelection: () => ({}),
		getSelectionText: async () => ({ kind: "empty" }),
		getViewInput: () => null,
		highlightColumns: () => undefined,
		open: () => undefined,
		resetColumnDisplayScale: () => false,
		reveal: () => false,
		select: () => false,
		selectAllColumns: () => false,
		storeColumnWidths: () => undefined,
	} as ITableServiceType;
}

function createTableModelService(): ITableModelService {
	return {
		_serviceBrand: undefined,
		onDidChangeModel: () => ({ dispose: () => undefined }),
		canHandleResource: () => true,
		createModelReference: async () => {
			throw new Error("Unexpected model reference creation in table drop target tests.");
		},
		get: () => undefined,
		getPreviewInput: () => null,
		registerContentProvider: () => ({ dispose: () => undefined }),
		resolve: () => undefined,
		dispose: () => undefined,
	} as ITableModelService;
}
