import type { Event } from "src/cs/base/common/event";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type { WorkbenchMainPart } from "src/cs/workbench/common/contextkeys";

export const IWorkbenchViewModeService = createDecorator<IWorkbenchViewModeService>("workbenchViewModeService");

export interface IWorkbenchViewModeService {
  readonly _serviceBrand: undefined;

  readonly viewMode: WorkbenchMainPart;
  readonly onDidChangeViewMode: Event<WorkbenchMainPart>;

  setViewMode(viewMode: WorkbenchMainPart): void;
}
