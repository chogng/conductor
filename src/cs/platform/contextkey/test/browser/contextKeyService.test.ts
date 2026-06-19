import assert from "assert";

import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import { ContextKeyService } from "src/cs/platform/contextkey/browser/contextKeyService";

suite("platform/contextkey/browser/contextKeyService", () => {
    ensureNoDisposablesAreLeakedInTestSuite();

    test("stores null as a value instead of removing the key", () => {
        const service = new ContextKeyService();
        const changes: boolean[] = [];
        const disposable = service.onDidChangeContext(event => {
            changes.push(event.affectsSome(["nullable"]));
        });

        service.setContext("nullable", null);

        assert.equal(service.getValue("nullable"), null);
        assert.equal(service.contextMatchesRules("nullable == null"), true);
        assert.deepEqual(changes, [true]);

        disposable.dispose();
        service.dispose();
    });

    test("does not notify when removing a missing key", () => {
        const service = new ContextKeyService();
        let changes = 0;
        const disposable = service.onDidChangeContext(() => {
            changes += 1;
        });

        service.setContext("missing", undefined);

        assert.equal(changes, 0);

        disposable.dispose();
        service.dispose();
    });

    test("scoped keys shadow parent values and suppress shadowed parent changes", () => {
        const parent = new ContextKeyService();
        parent.setContext("activeView", "parent");
        const scoped = parent.createScoped({} as HTMLElement);
        const scopedKey = scoped.createKey("activeView", "scoped");
        const changes: string[] = [];
        const disposable = scoped.onDidChangeContext(event => {
            if (event.affectsSome(["activeView"])) {
                changes.push(scoped.getValue("activeView") ?? "");
            }
        });

        assert.equal(scopedKey.get(), "scoped");
        parent.setContext("activeView", "nextParent");
        assert.equal(scoped.getValue("activeView"), "scoped");
        assert.deepEqual(changes, []);

        scopedKey.reset();
        assert.equal(scoped.getValue("activeView"), "scoped");

        disposable.dispose();
        scoped.dispose();
        parent.dispose();
    });
});
