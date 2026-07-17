/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { Emitter, Event } from "src/cs/base/common/event";
import { Disposable, type IDisposable } from "src/cs/base/common/lifecycle";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import type {
  DesktopUpdateStatus,
  IUpdateService,
} from "src/cs/platform/update/common/update";
import { UpdateTitleBarEntry } from "src/cs/workbench/contrib/update/browser/updateTitleBarEntry";
import { getUpdateTooltipText } from "src/cs/workbench/contrib/update/browser/updateTooltip";
import {
  CHECK_FOR_UPDATES_COMMAND_ID,
  DOWNLOAD_UPDATE_COMMAND_ID,
  INSTALL_UPDATE_COMMAND_ID,
  UPDATE_CHECKING_COMMAND_ID,
  UPDATE_DOWNLOADING_COMMAND_ID,
  UPDATE_INSTALLING_COMMAND_ID,
} from "src/cs/workbench/contrib/update/browser/update";
import type {
  ITitleService,
  WorkbenchTitlebarState,
} from "src/cs/workbench/services/title/browser/titleService";

suite("workbench/contrib/update/test/browser/updateTitleBarEntry", () => {
  ensureNoDisposablesAreLeakedInTestSuite();

  test("projects downloaded update status into titlebar state", () => {
    const status: DesktopUpdateStatus = {
      status: "downloaded",
      version: "1.2.3",
      channel: "github",
      isStoreManaged: false,
      message: null,
      progressPercent: null,
    };
    const updateService = new TestUpdateService(status);
    const titleService = new TestTitleService();
    const entry = new UpdateTitleBarEntry(updateService, titleService);

    try {
      assert.deepStrictEqual(titleService.state, {
        installUpdateCommandId: "update.install",
        isUpdateReadyToInstall: true,
        isUpdateVisible: true,
        updateCommandId: INSTALL_UPDATE_COMMAND_ID,
        updateLabel: "update.titlebar.install",
        updateProgressPercent: null,
        updateTooltip: getUpdateTooltipText(status, true),
        updateVersion: "1.2.3",
      });
    } finally {
      entry.dispose();
      titleService.dispose();
      updateService.dispose();
    }
  });

  test("projects available update status into titlebar state", () => {
    const status: DesktopUpdateStatus = {
      status: "available",
      version: "1.2.4",
      channel: "github",
      isStoreManaged: false,
      message: null,
      progressPercent: null,
    };
    const updateService = new TestUpdateService(status);
    const titleService = new TestTitleService();
    const entry = new UpdateTitleBarEntry(updateService, titleService);

    try {
      assert.deepStrictEqual(titleService.state, {
        installUpdateCommandId: "update.install",
        isUpdateReadyToInstall: false,
        isUpdateVisible: true,
        updateCommandId: DOWNLOAD_UPDATE_COMMAND_ID,
        updateLabel: "update.titlebar.download",
        updateProgressPercent: null,
        updateTooltip: getUpdateTooltipText(status, true),
        updateVersion: "1.2.4",
      });
    } finally {
      entry.dispose();
      titleService.dispose();
      updateService.dispose();
    }
  });

  test("clears titlebar update state when update is idle", () => {
    const updateService = new TestUpdateService({
      status: "downloaded",
      version: "1.2.3",
      channel: "github",
      isStoreManaged: false,
      message: null,
      progressPercent: null,
    });
    const titleService = new TestTitleService();
    const entry = new UpdateTitleBarEntry(updateService, titleService);

    try {
      updateService.setStatus({
        status: "idle",
        version: "1.2.3",
        channel: "github",
        isStoreManaged: false,
        message: null,
        progressPercent: null,
      });

      assert.deepStrictEqual(titleService.state, {
        installUpdateCommandId: "update.install",
        isUpdateReadyToInstall: false,
        isUpdateVisible: false,
        updateCommandId: null,
        updateLabel: null,
        updateProgressPercent: null,
        updateTooltip: null,
        updateVersion: null,
      });
    } finally {
      entry.dispose();
      titleService.dispose();
      updateService.dispose();
    }
  });

  test("projects downloading progress into titlebar state", () => {
    const status: DesktopUpdateStatus = {
      status: "downloading",
      version: "1.2.4",
      channel: "generic",
      isStoreManaged: false,
      message: null,
      progressPercent: 42,
    };
    const updateService = new TestUpdateService(status);
    const titleService = new TestTitleService();
    const entry = new UpdateTitleBarEntry(updateService, titleService);

    try {
      assert.deepStrictEqual(titleService.state, {
        installUpdateCommandId: "update.install",
        isUpdateReadyToInstall: false,
        isUpdateVisible: true,
        updateCommandId: UPDATE_DOWNLOADING_COMMAND_ID,
        updateLabel: 'update.titlebar.downloadingProgress:{"percent":42}',
        updateProgressPercent: 42,
        updateTooltip: getUpdateTooltipText(status, true),
        updateVersion: "1.2.4",
      });
    } finally {
      entry.dispose();
      titleService.dispose();
      updateService.dispose();
    }
  });

  test("projects in-progress and error statuses into titlebar state", () => {
    const cases: Array<{
      readonly canCheckForUpdates?: boolean;
      readonly expectedCommandId: string | null;
      readonly expectedLabel: string;
      readonly expectedVersion: string | null;
      readonly status: DesktopUpdateStatus;
    }> = [
      {
        expectedCommandId: UPDATE_CHECKING_COMMAND_ID,
        expectedLabel: "update.titlebar.checking",
        expectedVersion: null,
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
        expectedCommandId: UPDATE_INSTALLING_COMMAND_ID,
        expectedLabel: "update.titlebar.installing",
        expectedVersion: "1.2.5",
        status: {
          status: "updating",
          version: "1.2.5",
          channel: "github",
          isStoreManaged: false,
          message: null,
          progressPercent: null,
        },
      },
      {
        expectedCommandId: CHECK_FOR_UPDATES_COMMAND_ID,
        expectedLabel: "update.titlebar.error",
        expectedVersion: null,
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
        expectedCommandId: null,
        expectedLabel: "update.titlebar.error",
        expectedVersion: null,
        status: {
          status: "error",
          version: null,
          channel: "none",
          isStoreManaged: false,
          message: "Updates are unavailable.",
          progressPercent: null,
        },
      },
    ];

    for (const testCase of cases) {
      const updateService = new TestUpdateService(
        testCase.status,
        testCase.canCheckForUpdates ?? true,
      );
      const titleService = new TestTitleService();
      const entry = new UpdateTitleBarEntry(updateService, titleService);

      try {
        assert.deepStrictEqual(titleService.state, {
          installUpdateCommandId: "update.install",
          isUpdateReadyToInstall: false,
          isUpdateVisible: true,
          updateCommandId: testCase.expectedCommandId,
          updateLabel: testCase.expectedLabel,
          updateProgressPercent: null,
          updateTooltip: getUpdateTooltipText(
            testCase.status,
            testCase.canCheckForUpdates ?? true,
          ),
          updateVersion: testCase.expectedVersion,
        });
      } finally {
        entry.dispose();
        titleService.dispose();
        updateService.dispose();
      }
    }
  });

  test("hides titlebar update state for unavailable update statuses", () => {
    const cases: DesktopUpdateStatus[] = [
      {
        status: "idle",
        version: "1.2.3",
        channel: "github",
        isStoreManaged: false,
        message: null,
        progressPercent: null,
      },
      {
        status: "disabled",
        version: null,
        channel: "none",
        isStoreManaged: false,
        message: "Updates are disabled.",
        progressPercent: null,
      },
      {
        status: "unsupported",
        version: null,
        channel: "unsupported",
        isStoreManaged: false,
        message: "Updates are unsupported.",
        progressPercent: null,
      },
    ];

    for (const status of cases) {
      const updateService = new TestUpdateService(status);
      const titleService = new TestTitleService();
      const entry = new UpdateTitleBarEntry(updateService, titleService);

      try {
        assert.deepStrictEqual(titleService.state, {
          installUpdateCommandId: "update.install",
          isUpdateReadyToInstall: false,
          isUpdateVisible: false,
          updateCommandId: null,
          updateLabel: null,
          updateProgressPercent: null,
          updateTooltip: null,
          updateVersion: null,
        });
      } finally {
        entry.dispose();
        titleService.dispose();
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

class TestTitleService extends Disposable implements ITitleService {
  public declare readonly _serviceBrand: undefined;

  public readonly onDidChangeTitlebarState = Event.None as Event<void>;
  public state: WorkbenchTitlebarState = {};

  public attachTitlebarPart(_parent: HTMLElement): IDisposable {
    return { dispose: () => undefined };
  }

  public getTitlebarState(): WorkbenchTitlebarState | undefined {
    return this.state;
  }

  public layout(): void {}

  public patchTitlebarState(state: WorkbenchTitlebarState): void {
    this.state = {
      ...this.state,
      ...state,
    };
  }

  public updateTitlebarState(state: WorkbenchTitlebarState = {}): void {
    this.state = state;
  }
}
