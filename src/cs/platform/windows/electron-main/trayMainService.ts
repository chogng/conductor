import type { BrowserWindow, Event as ElectronEvent, Tray } from "electron";

import type { Event } from "../../../base/common/event.js";
import { createDecorator } from "../../instantiation/common/instantiation.js";

export const ITrayMainService =
  createDecorator<ITrayMainService>("trayMainService");

export type WindowCloseBehavior = "minimizeToTray" | "quit";

export interface ITrayMainService {
  readonly _serviceBrand: undefined;
  readonly onDidRequestQuit: Event<void>;

  createTray(): Tray | null;
  updateTrayMenu(): void;
  hideWindowToTray(win: BrowserWindow | null | undefined, options?: { readonly showTrayHint?: boolean }): void;
  handleWindowClose(win: BrowserWindow | null | undefined, event: ElectronEvent): boolean;
  shouldMinimizeToTrayOnWindowClose(): boolean;
  shouldKeepProcessAliveAfterAllWindowsClosed(): boolean;
  requestQuit(): void;
  markQuitRequested(): void;
  isQuitRequested(): boolean;
  destroy(): void;
}
