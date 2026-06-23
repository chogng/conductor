/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import { TemplateRuleService } from "src/cs/workbench/services/templateRule/browser/templateRuleService";
import { BrowserTemplateRuleStoreService } from "src/cs/workbench/services/templateRule/browser/templateRuleStoreService";

suite("workbench/services/templateRule/test/browser/templateRuleService", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();

  test("exposes builtin rule snapshot without evaluating raw tables", async () => {
    const storeService = store.add(new BrowserTemplateRuleStoreService());
    const service = store.add(new TemplateRuleService(storeService));
    const snapshot = service.getSnapshot();

    assert.equal(snapshot.rules.length, 5);
    assert.equal(snapshot.diagnostics.length, 0);
    assert.equal(snapshot.fingerprint.startsWith("rule:"), true);

    const events: unknown[] = [];
    const disposable = store.add(service.onDidChangeRules(event => events.push(event)));
    const reloaded = await service.reload();

    assert.equal(reloaded.fingerprint, snapshot.fingerprint);
    assert.deepEqual(events, []);
    disposable.dispose();
  });
});
