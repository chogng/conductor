/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, type Event } from "../../../base/common/event.js";
import { getCompressedContent, type IJSONSchema } from "../../../base/common/jsonSchema.js";
import { Disposable, type IDisposable, DisposableStore, toDisposable } from "../../../base/common/lifecycle.js";
import { Registry } from "../../registry/common/platform.js";

export const Extensions = {
	JSONContribution: "base.contributions.json",
} as const;

export interface ISchemaContributions {
	readonly schemas: { readonly [id: string]: IJSONSchema };
}

export interface IJSONContributionRegistry {
	readonly onDidChangeSchema: Event<string>;
	readonly onDidChangeSchemaAssociations: Event<void>;

	registerSchema(uri: string, unresolvedSchemaContent: IJSONSchema, store?: DisposableStore): void;
	registerSchemaAssociation(uri: string, glob: string): IDisposable;
	notifySchemaChanged(uri: string): void;
	getSchemaContributions(): ISchemaContributions;
	getSchemaAssociations(): { readonly [uri: string]: readonly string[] };
	getSchemaContent(uri: string): string | undefined;
	hasSchemaContent(uri: string): boolean;
}

function normalizeId(id: string): string {
	if (id.length > 0 && id.charAt(id.length - 1) === "#") {
		return id.substring(0, id.length - 1);
	}

	return id;
}

class JSONContributionRegistry extends Disposable implements IJSONContributionRegistry {
	private readonly schemasById: { [id: string]: IJSONSchema } = Object.create(null);
	private readonly schemaAssociations: { [uri: string]: string[] } = Object.create(null);

	private readonly onDidChangeSchemaEmitter = this._register(new Emitter<string>());
	public readonly onDidChangeSchema = this.onDidChangeSchemaEmitter.event;

	private readonly onDidChangeSchemaAssociationsEmitter = this._register(new Emitter<void>());
	public readonly onDidChangeSchemaAssociations = this.onDidChangeSchemaAssociationsEmitter.event;

	public registerSchema(uri: string, unresolvedSchemaContent: IJSONSchema, store?: DisposableStore): void {
		const normalizedUri = normalizeId(uri);
		this.schemasById[normalizedUri] = unresolvedSchemaContent;
		this.onDidChangeSchemaEmitter.fire(uri);

		store?.add(toDisposable(() => {
			delete this.schemasById[normalizedUri];
			this.onDidChangeSchemaEmitter.fire(uri);
		}));
	}

	public registerSchemaAssociation(uri: string, glob: string): IDisposable {
		const normalizedUri = normalizeId(uri);
		const associations = this.schemaAssociations[normalizedUri] ?? [];
		this.schemaAssociations[normalizedUri] = associations;

		if (!associations.includes(glob)) {
			associations.push(glob);
			this.onDidChangeSchemaAssociationsEmitter.fire();
		}

		return toDisposable(() => {
			const current = this.schemaAssociations[normalizedUri];
			if (!current) {
				return;
			}

			const index = current.indexOf(glob);
			if (index === -1) {
				return;
			}

			current.splice(index, 1);
			if (!current.length) {
				delete this.schemaAssociations[normalizedUri];
			}
			this.onDidChangeSchemaAssociationsEmitter.fire();
		});
	}

	public notifySchemaChanged(uri: string): void {
		this.onDidChangeSchemaEmitter.fire(uri);
	}

	public getSchemaContributions(): ISchemaContributions {
		return {
			schemas: this.schemasById,
		};
	}

	public getSchemaAssociations(): { readonly [uri: string]: readonly string[] } {
		return this.schemaAssociations;
	}

	public getSchemaContent(uri: string): string | undefined {
		const schema = this.schemasById[normalizeId(uri)];
		return schema ? getCompressedContent(schema) : undefined;
	}

	public hasSchemaContent(uri: string): boolean {
		return Boolean(this.schemasById[normalizeId(uri)]);
	}
}

Registry.add(Extensions.JSONContribution, new JSONContributionRegistry());
