import { Disposable } from "src/cs/base/common/lifecycle";
import {
  setGlobalHoverDelay,
  setGlobalSashSize,
} from "src/cs/base/browser/ui/sash/sash";
import type { IWorkbenchContribution } from "src/cs/workbench/common/contributions";

const minSize = 1;
const maxSize = 20;

const SASH_SIZE = 10;
const SASH_HOVER_DELAY = 180;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, Math.round(value)));

export class SashSettingsController extends Disposable implements IWorkbenchContribution {
  public static readonly ID = "workbench.contrib.sash";

  constructor() {
    super();
    this.applySettings();
  }

  private applySettings(): void {
    setGlobalSashSize(clamp(SASH_SIZE, minSize, maxSize));
    setGlobalHoverDelay(SASH_HOVER_DELAY);
  }
}
