/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { Emitter, Event } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import type {
  ICommandEvent,
  ICommandService as ICommandServiceType,
} from "src/cs/platform/commands/common/commands";
import type {
  DesktopUpdateStatus,
  IUpdateService,
} from "src/cs/platform/update/common/update";
import {
  getUpdateTooltipText,
  UpdateTooltip,
} from "src/cs/workbench/contrib/update/browser/updateTooltip";
import {
  CHECK_FOR_UPDATES_COMMAND_ID,
  DOWNLOAD_UPDATE_COMMAND_ID,
  INSTALL_UPDATE_COMMAND_ID,
} from "src/cs/workbench/contrib/update/common/update";

suite("workbench/contrib/update/test/browser/updateTooltip", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const originalDocument = globalThis.document;

  setup(() => {
    globalThis.document = createFakeDocument() as unknown as Document;
  });

  teardown(() => {
    globalThis.document = originalDocument;
  });

  test("formats titlebar tooltip text from update status", () => {
    const text = getUpdateTooltipText({
      status: "downloaded",
      version: "1.2.3",
      channel: "github",
      isStoreManaged: false,
      message: null,
      progressPercent: null,
    }, true);

    assert.ok(text.includes("update.tooltip.downloadedTitle"));
    assert.ok(text.includes("1.2.3"));
    assert.ok(text.includes("update.tooltip.downloadedMessage"));
  });

  test("formats downloading progress in tooltip text", () => {
    const text = getUpdateTooltipText({
      status: "downloading",
      version: "1.2.4",
      channel: "generic",
      isStoreManaged: false,
      message: null,
      progressPercent: 42,
    }, true);

    assert.ok(text.includes("update.tooltip.downloadingTitle"));
    assert.ok(text.includes("update.tooltip.downloadingProgressMessage"));
  });

  test("renders update status and dispatches the current action", () => {
    const updateService = new TestUpdateService({
      status: "downloaded",
      version: "1.2.3",
      channel: "github",
      isStoreManaged: false,
      message: null,
      progressPercent: null,
    });
    const commands: string[] = [];
    const tooltip = new UpdateTooltip(updateService, createCommandService(commands));

    try {
      assert.strictEqual(
        tooltip.domNode.querySelector(".update-tooltip__title")?.textContent,
        "update.tooltip.downloadedTitle",
      );
      assert.strictEqual(
        tooltip.domNode.querySelector(".update-tooltip__detail-value")?.textContent,
        "update.tooltip.state.downloaded",
      );
      assert.strictEqual(
        tooltip.domNode.querySelector<HTMLButtonElement>(".update-tooltip__action")?.textContent,
        "update.tooltip.installButton",
      );

      tooltip.domNode.querySelector<HTMLButtonElement>(".update-tooltip__action")?.click();

      assert.deepStrictEqual(commands, [INSTALL_UPDATE_COMMAND_ID]);

      updateService.setStatus({
        status: "checking",
        version: null,
        channel: "github",
        isStoreManaged: false,
        message: null,
        progressPercent: null,
      });

      assert.strictEqual(
        tooltip.domNode.querySelector(".update-tooltip__title")?.textContent,
        "update.tooltip.checkingTitle",
      );
      assert.strictEqual(
        tooltip.domNode.querySelector<HTMLElement>(".update-tooltip__buttons")?.style.display,
        "none",
      );
    } finally {
      tooltip.dispose();
      updateService.dispose();
    }
  });

  test("renders tooltip actions for each update status", () => {
    const cases: Array<{
      readonly canCheckForUpdates?: boolean;
      readonly expectedActionCommandId?: string;
      readonly expectedActionLabel?: string;
      readonly expectedStatusLabel: string;
      readonly expectedTitle: string;
      readonly status: DesktopUpdateStatus;
    }> = [
      {
        expectedActionCommandId: CHECK_FOR_UPDATES_COMMAND_ID,
        expectedActionLabel: "update.tooltip.checkButton",
        expectedStatusLabel: "update.tooltip.state.idle",
        expectedTitle: "update.tooltip.idleTitle",
        status: {
          status: "idle",
          version: null,
          channel: "none",
          isStoreManaged: false,
          message: null,
          progressPercent: null,
        },
      },
      {
        expectedStatusLabel: "update.tooltip.state.checking",
        expectedTitle: "update.tooltip.checkingTitle",
        status: {
          status: "checking",
          version: null,
          channel: "github",
          isStoreManaged: false,
          message: null,
          progressPercent: null,
        },
      },
      {
        expectedActionCommandId: DOWNLOAD_UPDATE_COMMAND_ID,
        expectedActionLabel: "update.tooltip.downloadButton",
        expectedStatusLabel: "update.tooltip.state.available",
        expectedTitle: "update.tooltip.availableTitle",
        status: {
          status: "available",
          version: "1.2.4",
          channel: "github",
          isStoreManaged: false,
          message: null,
          progressPercent: null,
        },
      },
      {
        expectedStatusLabel: "update.tooltip.state.downloading",
        expectedTitle: "update.tooltip.downloadingTitle",
        status: {
          status: "downloading",
          version: "1.2.4",
          channel: "generic",
          isStoreManaged: false,
          message: null,
          progressPercent: 42,
        },
      },
      {
        expectedActionCommandId: INSTALL_UPDATE_COMMAND_ID,
        expectedActionLabel: "update.tooltip.installButton",
        expectedStatusLabel: "update.tooltip.state.downloaded",
        expectedTitle: "update.tooltip.downloadedTitle",
        status: {
          status: "downloaded",
          version: "1.2.4",
          channel: "github",
          isStoreManaged: false,
          message: null,
          progressPercent: null,
        },
      },
      {
        expectedStatusLabel: "update.tooltip.state.updating",
        expectedTitle: "update.tooltip.updatingTitle",
        status: {
          status: "updating",
          version: "1.2.4",
          channel: "github",
          isStoreManaged: false,
          message: null,
          progressPercent: null,
        },
      },
      {
        expectedActionCommandId: CHECK_FOR_UPDATES_COMMAND_ID,
        expectedActionLabel: "update.tooltip.retryButton",
        expectedStatusLabel: "update.tooltip.state.error",
        expectedTitle: "update.tooltip.errorTitle",
        status: {
          status: "error",
          version: null,
          channel: "github",
          isStoreManaged: false,
          message: "Failed to check for updates.",
          progressPercent: null,
        },
      },
      {
        canCheckForUpdates: false,
        expectedStatusLabel: "update.tooltip.state.error",
        expectedTitle: "update.tooltip.errorTitle",
        status: {
          status: "error",
          version: null,
          channel: "none",
          isStoreManaged: false,
          message: "Updates are unavailable.",
          progressPercent: null,
        },
      },
      {
        expectedStatusLabel: "update.tooltip.state.disabled",
        expectedTitle: "update.tooltip.disabledTitle",
        status: {
          status: "disabled",
          version: null,
          channel: "none",
          isStoreManaged: false,
          message: null,
          progressPercent: null,
        },
      },
      {
        expectedStatusLabel: "update.tooltip.state.unsupported",
        expectedTitle: "update.tooltip.unsupportedTitle",
        status: {
          status: "unsupported",
          version: null,
          channel: "unsupported",
          isStoreManaged: false,
          message: null,
          progressPercent: null,
        },
      },
    ];

    for (const testCase of cases) {
      const updateService = new TestUpdateService(
        testCase.status,
        testCase.canCheckForUpdates ?? true,
      );
      const commands: string[] = [];
      const tooltip = new UpdateTooltip(updateService, createCommandService(commands));

      try {
        assert.strictEqual(
          tooltip.domNode.querySelector(".update-tooltip__title")?.textContent,
          testCase.expectedTitle,
        );
        assert.strictEqual(
          tooltip.domNode.querySelector(".update-tooltip__detail-value")?.textContent,
          testCase.expectedStatusLabel,
        );

        const actionButton =
          tooltip.domNode.querySelector<HTMLButtonElement>(".update-tooltip__action");
        if (testCase.expectedActionCommandId) {
          assert.strictEqual(
            tooltip.domNode.querySelector<HTMLElement>(".update-tooltip__buttons")?.style.display,
            "",
          );
          assert.strictEqual(actionButton?.textContent, testCase.expectedActionLabel);
          assert.strictEqual(actionButton?.dataset.commandId, testCase.expectedActionCommandId);
          actionButton?.click();
          assert.deepStrictEqual(commands, [testCase.expectedActionCommandId]);
        } else {
          assert.strictEqual(
            tooltip.domNode.querySelector<HTMLElement>(".update-tooltip__buttons")?.style.display,
            "none",
          );
          assert.strictEqual(actionButton?.dataset.commandId, "");
        }
      } finally {
        tooltip.dispose();
        updateService.dispose();
      }
    }
  });
});

class TestUpdateService extends Disposable implements IUpdateService {
  public declare readonly _serviceBrand: undefined;

  private readonly onDidChangeStatusEmitter =
    this._register(new Emitter<DesktopUpdateStatus>());
  public readonly onDidChangeStatus = this.onDidChangeStatusEmitter.event;

  public constructor(
    private status: DesktopUpdateStatus,
    private readonly canCheck = true,
  ) {
    super();
  }

  public canCheckForUpdates(): boolean {
    return this.canCheck;
  }

  public checkForUpdates(): Promise<unknown> {
    return Promise.resolve(undefined);
  }

  public checkForUpdatesAndInstall(): Promise<unknown> {
    return Promise.resolve(undefined);
  }

  public getStatus(): DesktopUpdateStatus {
    return this.status;
  }

  public installDownloadedUpdate(): Promise<unknown> {
    return Promise.resolve(undefined);
  }

  public applySpecificUpdate(_packagePath: string): Promise<unknown> {
    return Promise.resolve(undefined);
  }

  public setStatus(status: DesktopUpdateStatus): void {
    this.status = status;
    this.onDidChangeStatusEmitter.fire(status);
  }

}

function createCommandService(commands: string[]): ICommandServiceType {
  return {
    _serviceBrand: undefined,
    onDidExecuteCommand: Event.None as Event<ICommandEvent>,
    onWillExecuteCommand: Event.None as Event<ICommandEvent>,
    executeCommand: async <R = unknown>(commandId: string): Promise<R | undefined> => {
      commands.push(commandId);
      return undefined;
    },
  };
}

class FakeElement {
  public readonly attributes = new Map<string, string>();
  public readonly children: FakeElement[] = [];
  public readonly dataset: Record<string, string> = {};
  public readonly listeners = new Map<string, Set<(event: unknown) => void>>();
  public readonly style: Record<string, string> = {};
  public className = "";
  public textContent = "";
  public type = "";
  public parentElement: FakeElement | null = null;

  public constructor(public readonly tagName: string) {}

  public append(...nodes: Array<FakeElement | string>): void {
    for (const node of nodes) {
      if (typeof node === "string") {
        continue;
      }
      this.appendChild(node);
    }
  }

  public appendChild(node: FakeElement): FakeElement {
    node.parentElement = this;
    this.children.push(node);
    return node;
  }

  public addEventListener(type: string, listener: (event: unknown) => void): void {
    let listeners = this.listeners.get(type);
    if (!listeners) {
      listeners = new Set();
      this.listeners.set(type, listeners);
    }
    listeners.add(listener);
  }

  public removeEventListener(type: string, listener: (event: unknown) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  public click(): void {
    this.dispatchEvent({ type: "click" });
  }

  public dispatchEvent(event: { readonly type: string }): boolean {
    for (const listener of this.listeners.get(event.type) ?? []) {
      listener(event);
    }
    return true;
  }

  public querySelector<T extends Element = Element>(selector: string): T | null {
    for (const child of this.children) {
      if (child.matches(selector)) {
        return child as unknown as T;
      }
      const result = child.querySelector<T>(selector);
      if (result) {
        return result;
      }
    }
    return null;
  }

  public setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  public getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  private matches(selector: string): boolean {
    if (!selector.startsWith(".")) {
      return false;
    }

    const className = selector.slice(1);
    return this.className.split(/\s+/g).includes(className);
  }
}

const createFakeDocument = () => ({
  createElement: (tagName: string) =>
    new FakeElement(tagName.toUpperCase()) as unknown as HTMLElement,
});
