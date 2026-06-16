/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { DisposableStore } from "src/cs/base/common/lifecycle";
import { Registry } from "src/cs/platform/registry/common/platform";
import {
	Extensions,
	type IJSONContributionRegistry,
} from "src/cs/platform/jsonschemas/common/jsonContributionRegistry";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("platform/jsonschemas/common/jsonContributionRegistry", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
	test("registers and unregisters schema content", () => {
		const registry = Registry.as<IJSONContributionRegistry>(Extensions.JSONContribution);
		const store = new DisposableStore();
		const uri = "conductor://schemas/test-schema";

		registry.registerSchema(uri, {
			type: "object",
			properties: {
				name: { type: "string" },
			},
		}, store);

		assert.equal(registry.hasSchemaContent(`${uri}#`), true);
		assert.equal(JSON.parse(registry.getSchemaContent(uri) ?? "{}").type, "object");

		store.dispose();

		assert.equal(registry.hasSchemaContent(uri), false);
	});

	test("registers schema associations and removes them with the disposable", () => {
		const registry = Registry.as<IJSONContributionRegistry>(Extensions.JSONContribution);
		const uri = "conductor://schemas/test-association";
		const disposable = registry.registerSchemaAssociation(`${uri}#`, "User/template.json");

		assert.deepStrictEqual(registry.getSchemaAssociations()[uri], ["User/template.json"]);

		disposable.dispose();

		assert.equal(registry.getSchemaAssociations()[uri], undefined);
	});
});
