import type { Event } from "src/cs/base/common/event";
import type { IDisposable } from "src/cs/base/common/lifecycle";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type { WorkbenchMainPart } from "src/cs/workbench/services/layout/browser/layoutService";

export const ITitleService = createDecorator<ITitleService>("titleService");

export type WorkbenchTitlebarActivePage =
  | WorkbenchMainPart
  | string;

export type WorkbenchTitlebarState = {
  readonly activePage?: WorkbenchMainPart;
  readonly canNavigateBack?: boolean;
  readonly canNavigateForward?: boolean;
  readonly chartIntentCommandId?: string;
  readonly enabled?: boolean;
  readonly installUpdateCommandId?: string | null;
  readonly isAuxiliaryBarExpanded?: boolean;
  readonly isSidebarVisible?: boolean;
  readonly isUpdateReadyToInstall?: boolean;
  readonly isUpdateVisible?: boolean;
  readonly updateCommandId?: string | null;
  readonly updateLabel?: string | null;
  readonly updateProgressPercent?: number | null;
  readonly updateTooltip?: string | null;
  readonly updateVersion?: string | null;
};

export interface ITitleService {
  readonly _serviceBrand: undefined;

  readonly onDidChangeTitlebarState: Event<void>;

  attachTitlebarPart(parent: HTMLElement): IDisposable;
  getTitlebarState(): WorkbenchTitlebarState | undefined;
  layout(): void;
  patchTitlebarState(state: WorkbenchTitlebarState): void;
  updateTitlebarState(state?: WorkbenchTitlebarState): void;
}
