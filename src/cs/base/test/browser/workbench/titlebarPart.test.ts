import assert from "assert";

import { Event } from "src/cs/base/common/event";
import type { ICommandService } from "src/cs/platform/commands/common/commands";
import { WORKBENCH_TITLEBAR_UPDATE_BUTTON_ID } from "src/cs/workbench/browser/parts/titlebar/titlebarActions";
import { WorkbenchTitlebarPart } from "src/cs/workbench/browser/parts/titlebar/titlebarPart";

suite("workbench/browser/parts/titlebar/titlebarPart", () => {
  test("reserves a trailing gutter when window controls are on the left", () => {
    const parent = document.createElement("div");
    const part = new WorkbenchTitlebarPart(parent);

    part.update({
      activePage: "table",
      chrome: {
        showBrandIcon: false,
        windowControlsSide: "left",
      },
    });

    const rightControls = parent.querySelector(".titlebar-right");

    assert.ok(rightControls);
    assert.ok(rightControls.querySelector(".titlebar-right-spacer"));
    assert.equal(rightControls.querySelector(".window-controls-container"), null);

    part.dispose();
  });

  test("uses the native controls reservation when window controls are on the right", () => {
    const parent = document.createElement("div");
    const part = new WorkbenchTitlebarPart(parent);

    part.update({
      activePage: "table",
      chrome: {
        showBrandIcon: true,
        windowControlsSide: "right",
      },
    });

    const rightControls = parent.querySelector(".titlebar-right");
    const windowControls = rightControls?.querySelector<HTMLElement>(".window-controls-container");

    assert.ok(rightControls);
    assert.ok(windowControls);
    assert.equal(windowControls.style.width, "138px");
    assert.equal(rightControls.querySelector(".titlebar-right-spacer"), null);

    part.dispose();
  });

  test("renders update entry as a titlebar actionbar item", () => {
    const parent = document.createElement("div");
    const calls: string[] = [];
    const part = new WorkbenchTitlebarPart(parent);

    part.update({
      activePage: "table",
      commandService: createCommandService(calls),
      updateAction: {
        commandId: "update.install",
        isVisible: true,
        label: "Install",
        tooltip: "Install Update",
      },
    });

    const updateButton = getUpdateButton(parent);

    assert.ok(updateButton.closest(".titlebar-actionbar"));
    assert.ok(updateButton.closest(".ui-actionbar__item"));
    assert.equal(updateButton.textContent, "Install");
    updateButton.click();
    assert.deepEqual(calls, ["update.install"]);

    part.dispose();
  });

  test("updates titlebar update action without recreating the action item", () => {
    const parent = document.createElement("div");
    const calls: string[] = [];
    const commandService = createCommandService(calls);
    const part = new WorkbenchTitlebarPart(parent);

    part.update({
      activePage: "table",
      commandService,
      updateAction: {
        commandId: "update.downloadNow",
        isVisible: true,
        label: "Download",
        tooltip: "Download Update",
      },
    });
    const updateButton = getUpdateButton(parent);

    part.update({
      activePage: "table",
      commandService,
      updateAction: {
        commandId: "update.downloading",
        isVisible: true,
        label: "42%",
        progressPercent: 42,
        tooltip: "Downloading Update",
      },
    });

    const nextUpdateButton = getUpdateButton(parent);

    assert.equal(nextUpdateButton, updateButton);
    assert.equal(updateButton.textContent, "42%");
    assert.equal(updateButton.getAttribute("aria-label"), "Downloading Update");
    assert.ok(updateButton.classList.contains("titlebar-update-button--progress"));
    assert.equal(
      updateButton.style.getPropertyValue("--titlebar-update-progress"),
      "42%",
    );
    updateButton.click();
    assert.deepEqual(calls, ["update.downloading"]);

    part.dispose();
  });

  test("removes update actionbar item when update state is hidden", () => {
    const parent = document.createElement("div");
    const commandService = createCommandService([]);
    const part = new WorkbenchTitlebarPart(parent);

    part.update({
      activePage: "table",
      commandService,
      updateAction: {
        commandId: "update.install",
        isVisible: true,
        label: "Install",
        tooltip: "Install Update",
      },
    });

    assert.ok(getUpdateButton(parent));

    part.update({
      activePage: "table",
      commandService,
      updateAction: {
        isVisible: false,
      },
    });

    assert.equal(
      parent.querySelector<HTMLButtonElement>(`#${WORKBENCH_TITLEBAR_UPDATE_BUTTON_ID}`),
      null,
    );

    part.dispose();
  });

  test("clears titlebar update progress styles without recreating the action item", () => {
    const parent = document.createElement("div");
    const commandService = createCommandService([]);
    const part = new WorkbenchTitlebarPart(parent);

    part.update({
      activePage: "table",
      commandService,
      updateAction: {
        commandId: "update.downloading",
        isVisible: true,
        label: "42%",
        progressPercent: 42,
        tooltip: "Downloading Update",
      },
    });
    const updateButton = getUpdateButton(parent);

    part.update({
      activePage: "table",
      commandService,
      updateAction: {
        commandId: "update.checking",
        isVisible: true,
        label: "Checking...",
        progressPercent: null,
        tooltip: "Checking for Updates",
      },
    });

    const nextUpdateButton = getUpdateButton(parent);

    assert.equal(nextUpdateButton, updateButton);
    assert.equal(updateButton.textContent, "Checking...");
    assert.equal(updateButton.getAttribute("aria-label"), "Checking for Updates");
    assert.equal(updateButton.classList.contains("titlebar-update-button--progress"), false);
    assert.equal(
      updateButton.style.getPropertyValue("--titlebar-update-progress"),
      "",
    );

    part.dispose();
  });
});

const createCommandService = (calls: string[]): ICommandService => ({
  _serviceBrand: undefined,
  onWillExecuteCommand: Event.None,
  onDidExecuteCommand: Event.None,
  executeCommand: async commandId => {
    calls.push(commandId);
    return undefined;
  },
});

const getUpdateButton = (parent: HTMLElement): HTMLButtonElement => {
  const button = parent.querySelector<HTMLButtonElement>(
    `#${WORKBENCH_TITLEBAR_UPDATE_BUTTON_ID}`,
  );

  assert.ok(button);
  return button;
};
