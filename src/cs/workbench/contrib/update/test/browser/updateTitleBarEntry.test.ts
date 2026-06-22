/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { Emitter, Event } from "src/cs/base/common/event";
import { Disposable, type IDisposable } from "src/cs/base/common/lifecycle";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import { UpdateTitleBarEntry } from "src/cs/workbench/contrib/update/browser/updateTitleBarEntry";
import { getUpdateTooltipText } from "src/cs/workbench/contrib/update/browser/updateTooltip";
import {
  UpdateCommandId,
  type DesktopUpdateStatus,
  type IWorkbenchUpdateService,
} from "src/cs/workbench/contrib/update/common/update";
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
    };
    const updateService = new TestUpdateService(status);
    const titleService = new TestTitleService();
    const entry = new UpdateTitleBarEntry(updateService, titleService);

    try {
      assert.deepStrictEqual(titleService.state, {
        installUpdateCommandId: "update.install",
        isUpdateReadyToInstall: true,
        isUpdateVisible: true,
        updateCommandId: UpdateCommandId.install,
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
    };
    const updateService = new TestUpdateService(status);
    const titleService = new TestTitleService();
    const entry = new UpdateTitleBarEntry(updateService, titleService);

    try {
      assert.deepStrictEqual(titleService.state, {
        installUpdateCommandId: "update.install",
        isUpdateReadyToInstall: false,
        isUpdateVisible: true,
        updateCommandId: UpdateCommandId.downloadNow,
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
      });

      assert.deepStrictEqual(titleService.state, {
        installUpdateCommandId: "update.install",
        isUpdateReadyToInstall: false,
        isUpdateVisible: false,
        updateCommandId: null,
        updateTooltip: null,
        updateVersion: null,
      });
    } finally {
      entry.dispose();
      titleService.dispose();
      updateService.dispose();
    }
  });
});

class TestUpdateService extends Disposable implements IWorkbenchUpdateService {
  public declare readonly _serviceBrand: undefined;

  private readonly onDidChangeStatusEmitter =
    this._register(new Emitter<DesktopUpdateStatus>());
  public readonly onDidChangeStatus = this.onDidChangeStatusEmitter.event;

  public constructor(private status: DesktopUpdateStatus) {
    super();
  }

  public canCheckForUpdates(): boolean {
    return true;
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
