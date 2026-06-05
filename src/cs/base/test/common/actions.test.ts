import assert from "assert";

import {
  Action,
  ActionRunner,
  EmptySubmenuAction,
  Separator,
  SubmenuAction,
  toAction,
} from "../../common/actions.ts";

suite("base/test/common/actions", () => {
  test("Action emits change events only when values change", () => {
    const action = new Action("test", "Initial", "initial");
    const changes: unknown[] = [];

    action.onDidChange(change => changes.push(change));
    action.label = "Next";
    action.label = "Next";
    action.tooltip = "Tip";
    action.class = "next";
    action.enabled = false;
    action.checked = true;

    assert.deepEqual(changes, [
      { label: "Next" },
      { tooltip: "Tip" },
      { class: "next" },
      { enabled: false },
      { checked: true },
    ]);
  });

  test("ActionRunner emits will and did events and rethrows errors", async () => {
    const runner = new ActionRunner();
    const order: string[] = [];
    const error = new Error("boom");
    const action = toAction({
      id: "run",
      run: () => {
        order.push("run");
        throw error;
      },
    });

    runner.onWillRun(event => order.push(`will:${event.action.id}`));
    runner.onDidRun(event => order.push(`did:${event.action.id}:${event.error === error}`));

    await assert.rejects(runner.run(action), error);
    assert.deepEqual(order, ["will:run", "run", "did:run:true"]);
  });

  test("ActionRunner ignores disabled actions", async () => {
    const runner = new ActionRunner();
    let didRun = false;

    await runner.run(toAction({
      id: "disabled",
      enabled: false,
      run: () => {
        didRun = true;
      },
    }));

    assert.equal(didRun, false);
  });

  test("Separator joins and cleans action lists", () => {
    const first = toAction({ id: "first", run: () => {} });
    const second = toAction({ id: "second", run: () => {} });
    const joined = Separator.join([], [first], [second]);

    assert.deepEqual(joined.map(action => action.id), [first.id, Separator.ID, second.id]);

    const cleaned = Separator.clean([
      new Separator(),
      first,
      new Separator(),
      new Separator(),
      second,
      new Separator(),
    ]);

    assert.deepEqual(cleaned.map(action => action.id), [first.id, Separator.ID, second.id]);
  });

  test("Submenu actions expose metadata without running work", async () => {
    const child = toAction({ id: "child", run: () => {} });
    const submenu = new SubmenuAction("menu", "Menu", [child], "menu-class");
    const empty = new EmptySubmenuAction();

    assert.equal(submenu.id, "menu");
    assert.equal(submenu.label, "Menu");
    assert.deepEqual(submenu.actions, [child]);
    assert.equal(submenu.class, "menu-class");
    assert.equal(empty.enabled, false);

    await submenu.run();
    await empty.run();
  });
});
