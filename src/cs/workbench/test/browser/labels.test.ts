/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { Emitter } from "src/cs/base/common/event";
import type { IDisposable } from "src/cs/base/common/lifecycle";
import { URI } from "src/cs/base/common/uri";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import { FileKind, ResourceLabels } from "src/cs/workbench/browser/labels";
import type {
	IDecoration,
	IResourceDecorationChangeEvent,
} from "src/cs/workbench/services/decorations/common/decorations";

suite("workbench/test/browser/labels", () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const originalDocument = globalThis.document;

	setup(() => {
		globalThis.document = createFakeDocument() as unknown as Document;
	});

	teardown(() => {
		globalThis.document = originalDocument;
	});

	test("applies file decoration color and tooltip from decorations service", () => {
		const resource = URI.file("/workspace/data.csv");
		const service = new TestDecorationsService({
			color: "charts.orange",
			tooltip: "Review needs adjustment.",
		});
		store.add(service);
		const labels = new ResourceLabels(service);
		const container = document.createElement("div");
		const label = labels.create(container);

		label.setResource(
			{ name: "data.csv", resource: "/workspace/data.csv" },
			{
				fileDecorations: { resource },
				fileKind: FileKind.FILE,
			},
		);

		assert.equal(label.element.dataset.decorationColor, "orange");
		assert.equal(label.element.style.color, "orange");
		assert.equal(label.element.title, "Review needs adjustment.");

		labels.dispose();
	});

	test("refreshes label decorations when decorations service reports a change", () => {
		const resource = URI.file("/workspace/data.csv");
		const service = new TestDecorationsService({
			color: "charts.orange",
			tooltip: "Review needs adjustment.",
		});
		store.add(service);
		const labels = new ResourceLabels(service);
		const container = document.createElement("div");
		const label = labels.create(container);
		label.setResource(
			{ name: "data.csv", resource: "/workspace/data.csv" },
			{
				fileDecorations: { resource },
				fileKind: FileKind.FILE,
			},
		);

		service.decoration = {
			color: "charts.red",
			tooltip: "Review invalid.",
		};
		service.fire(resource);

		assert.equal(label.element.dataset.decorationColor, "red");
		assert.equal(label.element.style.color, "red");
		assert.equal(label.element.title, "Review invalid.");

		labels.dispose();
	});

	test("suppresses decoration tooltip when the caller owns hover content", () => {
		const resource = URI.file("/workspace/data.csv");
		const service = new TestDecorationsService({
			color: "charts.orange",
			tooltip: "Review needs adjustment.",
		});
		store.add(service);
		const labels = new ResourceLabels(service);
		const container = document.createElement("div");
		const label = labels.create(container);

		label.setResource(
			{ name: "data.csv", resource: "/workspace/data.csv" },
			{
				fileDecorations: {
					resource,
					showTooltip: false,
				},
				fileKind: FileKind.FILE,
			},
		);

		assert.equal(label.element.dataset.decorationColor, "orange");
		assert.equal(label.element.style.color, "orange");
		assert.equal(label.element.title, "");

		labels.dispose();
	});
});

class TestDecorationsService implements IDisposable {
	private readonly onDidChangeDecorationsEmitter = new Emitter<IResourceDecorationChangeEvent>();
	public readonly onDidChangeDecorations = this.onDidChangeDecorationsEmitter.event;

	public constructor(
		public decoration: {
			readonly color: string;
			readonly tooltip: string;
		},
	) {}

	public getDecoration(): IDecoration {
		return {
			badgeClassName: "test-decoration-badge",
			data: [{
				color: this.decoration.color,
				tooltip: this.decoration.tooltip,
			}],
			dispose: () => undefined,
			iconClassName: "test-decoration-icon",
			labelClassName: "test-decoration-label",
			strikethrough: false,
			tooltip: this.decoration.tooltip,
		};
	}

	public fire(resource: URI): void {
		this.onDidChangeDecorationsEmitter.fire({
			affectsResource: uri => uri.toString() === resource.toString(),
		});
	}

	public dispose(): void {
		this.onDidChangeDecorationsEmitter.dispose();
	}
}

class FakeElement {
	public readonly attributes = new Map<string, string>();
	public readonly children: FakeElement[] = [];
	public readonly dataset: Record<string, string> = {};
	public readonly style = new FakeStyle();
	public className = "";
	public innerHTML = "";
	public parentElement: FakeElement | null = null;
	public textContent = "";
	public title = "";

	public append(...nodes: FakeElement[]): void {
		for (const node of nodes) {
			this.appendChild(node);
		}
	}

	public appendChild(node: FakeElement): FakeElement {
		node.parentElement = this;
		this.children.push(node);
		return node;
	}

	public remove(): void {
		this.parentElement = null;
	}

	public replaceChildren(...nodes: FakeElement[]): void {
		this.children.length = 0;
		this.append(...nodes);
	}

	public setAttribute(name: string, value: string): void {
		this.attributes.set(name, value);
	}

	public getAttribute(name: string): string | null {
		return this.attributes.get(name) ?? null;
	}

	public removeAttribute(name: string): void {
		this.attributes.delete(name);
	}
}

class FakeStyle {
	public color = "";
	public textDecoration = "";

	public removeProperty(name: string): void {
		if (name === "color") {
			this.color = "";
		}
		if (name === "text-decoration") {
			this.textDecoration = "";
		}
	}
}

const createFakeDocument = () => ({
	createElement: () => new FakeElement() as unknown as HTMLElement,
});
