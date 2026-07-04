import assert from "assert";

import {
    ContextKeyExpr,
    evaluateContextKeyRules,
    getContextKeyRulesKeys,
    RawContextKey,
    type IContext,
} from "src/cs/platform/contextkey/common/contextkey";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

class TestContext implements IContext {
    public constructor(private readonly values: Readonly<Record<string, unknown>>) {}

    public getValue<T>(key: string): T | undefined {
        return this.values[key] as T | undefined;
    }
}

suite("platform/contextkey/common/contextkey", () => {
    ensureNoDisposablesAreLeakedInTestSuite();

    test("evaluates structured expressions", () => {
        const context = new TestContext({
            activePanelViewContainer: "workbench.viewContainer.chart",
            fileCount: 3,
            hasWebFileSystemAccess: true,
        });

        assert.equal(
            evaluateContextKeyRules(
                ContextKeyExpr.and(
                    ContextKeyExpr.equals("activePanelViewContainer", "workbench.viewContainer.chart"),
                    ContextKeyExpr.greater("fileCount", 1),
                    ContextKeyExpr.or(
                        ContextKeyExpr.has("hasWebFileSystemAccess"),
                        ContextKeyExpr.equals("activePanelViewContainer", "workbench.viewContainer.table"),
                    ),
                ),
                context,
            ),
            true,
        );
    });

    test("evaluates string rules with grouped or clauses", () => {
        const context = new TestContext({
            activeAuxiliaryBarView: "search",
            activePanelViewContainer: "workbench.viewContainer.chart",
            fileCount: 2,
        });

        assert.equal(
            evaluateContextKeyRules(
                "activePanelViewContainer == 'workbench.viewContainer.chart' && (activeAuxiliaryBarView == 'export' || activeAuxiliaryBarView == 'search') && fileCount >= 2",
                context,
            ),
            true,
        );
    });

    test("extracts expression keys centrally", () => {
        const rules = ContextKeyExpr.and(
            ContextKeyExpr.equals("activePanelViewContainer", "workbench.viewContainer.chart"),
            ContextKeyExpr.or(
                ContextKeyExpr.equals("activeAuxiliaryBarView", "search"),
                ContextKeyExpr.greaterEquals("fileCount", 1),
            ),
        );

        assert.deepEqual(
            getContextKeyRulesKeys(rules),
            ["activePanelViewContainer", "activeAuxiliaryBarView", "fileCount"],
        );
        assert.deepEqual(
            getContextKeyRulesKeys("activePanelViewContainer == 'workbench.viewContainer.chart' && (activeAuxiliaryBarView == 'search' || fileCount > 0)"),
            ["activePanelViewContainer", "activeAuxiliaryBarView", "fileCount"],
        );
    });

    test("records raw context key metadata", () => {
        const key = new RawContextKey<boolean>("test.metadata.context", false, "Test metadata context");
        const metadata = [...RawContextKey.all()].find(info => info.key === key.key);

        assert.deepEqual(metadata, {
            description: "Test metadata context",
            key: "test.metadata.context",
            type: "boolean",
        });
    });
});
