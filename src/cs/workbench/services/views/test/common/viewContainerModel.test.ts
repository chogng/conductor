import * as assert from "assert";

import { SyncDescriptor } from "src/cs/platform/instantiation/common/descriptors";
import { ContextKeyService } from "src/cs/platform/contextkey/browser/contextKeyService";
import { ContextKeyExpr } from "src/cs/platform/contextkey/common/contextkey";
import { type IView, type IViewPaneContainer, type ViewContainer } from "src/cs/workbench/common/views";
import { ViewContainerModel } from "src/cs/workbench/services/views/common/viewContainerModel";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

class TestView implements IView {
  public readonly id = "test.view";
  public readonly element = document.createElement("div");

  public isBodyVisible(): boolean {
    return true;
  }

  public isVisible(): boolean {
    return true;
  }

  public focus(): void {}

  public setVisible(): boolean {
    return false;
  }

  public getProgressIndicator(): unknown | undefined {
    return undefined;
  }

  public layout(): void {}

  public dispose(): void {}
}

class TestViewPaneContainer implements IViewPaneContainer {
  public readonly element = document.createElement("div");
  public readonly title = "Test";
  public readonly actions = [];
  public readonly contextActions = [];
  public readonly onDidAddViews = () => ({ dispose: () => undefined });
  public readonly onDidRemoveViews = () => ({ dispose: () => undefined });
  public readonly onDidChangeViewVisibility = () => ({ dispose: () => undefined });
  public readonly views = [];

  public setVisible(): void {}
  public isVisible(): boolean { return true; }
  public focus(): void {}
  public getActionsContext(): unknown { return undefined; }
  public getView(): IView | undefined { return undefined; }
  public addView(view: IView): IView { return view; }
  public setViewVisible(): boolean { return false; }
  public setTitle(): void {}
  public setActions(): void {}
  public openView(): IView | undefined { return undefined; }
  public removeView(): void {}
  public toggleViewVisibility(): void {}
  public dispose(): void {}
}

suite("workbench/services/views/common/viewContainerModel", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("updates active descriptors when context keys change", () => {
    const contextKeyService = new ContextKeyService();
    const model = new ViewContainerModel({
      ctorDescriptor: new SyncDescriptor(TestViewPaneContainer),
      id: "test.container",
      title: "Test",
    } satisfies ViewContainer, contextKeyService);

    model.add([{
      viewDescriptor: {
        ctorDescriptor: new SyncDescriptor(TestView),
        id: "test.view",
        name: "Test",
        when: ContextKeyExpr.equals("activeWorkbenchMainPart", "chart"),
      },
    }]);

    assert.deepStrictEqual(model.activeViewDescriptors.map(view => view.id), []);

    contextKeyService.setContext("activeWorkbenchMainPart", "chart");

    assert.deepStrictEqual(model.activeViewDescriptors.map(view => view.id), ["test.view"]);

    model.dispose();
    contextKeyService.dispose();
  });

  test("switches mutually exclusive workbench main views from mode context", () => {
    const contextKeyService = new ContextKeyService();
    const model = new ViewContainerModel({
      ctorDescriptor: new SyncDescriptor(TestViewPaneContainer),
      id: "workbench.main",
      title: "Workbench",
    } satisfies ViewContainer, contextKeyService);

    model.add([
      {
        viewDescriptor: {
          ctorDescriptor: new SyncDescriptor(TestView),
          id: "workbench.table",
          name: "Table",
          order: 0,
          when: ContextKeyExpr.equals("activeWorkbenchMainPart", "table"),
        },
      },
      {
        viewDescriptor: {
          ctorDescriptor: new SyncDescriptor(TestView),
          id: "workbench.chart",
          name: "Chart",
          order: 10,
          when: ContextKeyExpr.equals("activeWorkbenchMainPart", "chart"),
        },
      },
    ]);

    assert.deepStrictEqual(model.visibleViewDescriptors.map(view => view.id), []);

    contextKeyService.setContext("activeWorkbenchMainPart", "table");

    assert.deepStrictEqual(model.visibleViewDescriptors.map(view => view.id), ["workbench.table"]);

    contextKeyService.setContext("activeWorkbenchMainPart", "chart");

    assert.deepStrictEqual(model.visibleViewDescriptors.map(view => view.id), ["workbench.chart"]);

    model.dispose();
    contextKeyService.dispose();
  });
});
