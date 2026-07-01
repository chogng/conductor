import { Event } from "src/cs/base/common/event";
import type { ICommandService } from "src/cs/platform/commands/common/commands";
import type {
  WorkbenchTitlebarProps,
  WorkbenchTitlebarUpdateAction,
} from "src/cs/workbench/browser/parts/titlebar/windowTitle";
import { WorkbenchTitlebarPart } from "src/cs/workbench/browser/parts/titlebar/titlebarPart";
import { UpdateCommandId } from "src/cs/workbench/contrib/update/common/update";

import "src/cs/workbench/browser/style";

type PreviewCase = {
  readonly id: string;
  readonly name: string;
  readonly updateAction?: WorkbenchTitlebarUpdateAction;
};

const previewCases: PreviewCase[] = [
  {
    id: "update",
    name: "Update",
    updateAction: {
      commandId: UpdateCommandId.check,
      isVisible: true,
      label: "Update",
      tooltip: "Check for Updates",
    },
  },
  {
    id: "checking",
    name: "Checking",
    updateAction: {
      commandId: UpdateCommandId.checking,
      isVisible: true,
      label: "Checking...",
      tooltip: "Checking for Updates",
    },
  },
  {
    id: "downloading",
    name: "Downloading 42%",
    updateAction: {
      commandId: UpdateCommandId.downloading,
      isVisible: true,
      label: "42%",
      progressPercent: 42,
      tooltip: "Downloading Update - 42% complete",
      version: "1.5.20",
    },
  },
  {
    id: "downloaded",
    name: "Downloaded",
    updateAction: {
      commandId: UpdateCommandId.install,
      isReadyToInstall: true,
      isVisible: true,
      label: "Install",
      tooltip: "Update Ready to Install - Version: 1.5.20",
      version: "1.5.20",
    },
  },
  {
    id: "updating",
    name: "Updating",
    updateAction: {
      commandId: UpdateCommandId.updating,
      isVisible: true,
      label: "Installing...",
      tooltip: "Installing Update",
      version: "1.5.20",
    },
  },
  {
    id: "available",
    name: "Available",
    updateAction: {
      commandId: UpdateCommandId.downloadNow,
      isVisible: true,
      label: "Download",
      tooltip: "Update Available - Version: 1.5.20",
      version: "1.5.20",
    },
  },
  {
    id: "hidden",
    name: "Hidden / idle",
    updateAction: {
      isVisible: false,
    },
  },
  {
    id: "error-retry",
    name: "Error / retry",
    updateAction: {
      commandId: UpdateCommandId.check,
      isVisible: true,
      label: "Update Error",
      tooltip: "Update Error - Check Again",
    },
  },
  {
    id: "error-passive",
    name: "Error / no action",
    updateAction: {
      isVisible: true,
      label: "Update Error",
      tooltip: "Update Error - Updates are unavailable",
    },
  },
];

const previewFlowNextCaseId = new Map<string, string>([
  ["update", "checking"],
  ["checking", "downloading"],
  ["downloading", "downloaded"],
  ["downloaded", "updating"],
  ["error-retry", "checking"],
]);

const clickedCommands: string[] = [];
let selectedCaseIndex = Math.max(
  0,
  previewCases.findIndex(previewCase => previewCase.id === "update"),
);

const commandService: ICommandService = {
  _serviceBrand: undefined,
  onWillExecuteCommand: Event.None,
  onDidExecuteCommand: Event.None,
  executeCommand: async commandId => {
    clickedCommands.push(commandId);
    advanceFakeUpdateFlow(commandId);
    renderCommandLog();
    return undefined;
  },
};

const root = document.querySelector<HTMLElement>("#preview-root") ?? document.body;
root.replaceChildren();
root.className = "titlebar-update-preview";

const style = document.createElement("style");
style.textContent = `
  html,
  body,
  #preview-root {
    min-height: 100%;
  }

  .titlebar-update-preview {
    background: rgb(var(--bg-page));
    color: rgb(var(--text-primary));
    min-height: 100vh;
    padding: 20px;
  }

  .titlebar-update-preview__controls {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 14px;
  }

  .titlebar-update-preview__state-button {
    background: rgb(var(--bg-surface));
    border: 1px solid rgb(var(--border-subtle));
    border-radius: 7px;
    color: rgb(var(--text-secondary));
    font-size: 12px;
    height: 30px;
    padding: 0 10px;
  }

  .titlebar-update-preview__state-button:hover {
    background: rgb(var(--bg-surface-hover));
    color: rgb(var(--text-primary));
  }

  .titlebar-update-preview__state-button[data-selected="true"] {
    background: rgb(var(--accent));
    border-color: rgb(var(--accent));
    color: rgb(var(--bg-surface));
  }

  .titlebar-update-preview__log {
    color: rgb(var(--text-secondary));
    flex: 1 1 18rem;
    font-size: 12px;
    min-width: 0;
    overflow: hidden;
    text-align: right;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .titlebar-update-preview__surface {
    border: 1px solid rgb(var(--border-subtle));
    border-radius: 8px;
    height: 35px;
    margin-bottom: 18px;
    overflow: hidden;
  }

  .titlebar-update-preview__matrix {
    display: grid;
    gap: 10px;
  }

  .titlebar-update-preview__case {
    border: 1px solid rgb(var(--border-subtle));
    border-radius: 8px;
    overflow: hidden;
  }

  .titlebar-update-preview__case-label {
    background: rgb(var(--bg-200) / 0.45);
    border-bottom: 1px solid rgb(var(--border-subtle));
    color: rgb(var(--text-secondary));
    font-size: 12px;
    padding: 6px 10px;
  }

  .titlebar-update-preview__case-host {
    height: 35px;
  }
`;
document.head.appendChild(style);

const controls = document.createElement("div");
controls.className = "titlebar-update-preview__controls";

const log = document.createElement("div");
log.className = "titlebar-update-preview__log";

const surface = document.createElement("section");
surface.className = "titlebar-update-preview__surface";

const titlebarHost = document.createElement("div");
surface.append(titlebarHost);

const matrix = document.createElement("div");
matrix.className = "titlebar-update-preview__matrix";

root.append(controls, surface, matrix);

const activePart = new WorkbenchTitlebarPart(titlebarHost);
const stateButtons: HTMLButtonElement[] = [];

for (const [index, previewCase] of previewCases.entries()) {
  const button = document.createElement("button");
  button.className = "titlebar-update-preview__state-button";
  button.type = "button";
  button.textContent = previewCase.name;
  button.addEventListener("click", () => {
    selectedCaseIndex = index;
    renderActivePreview();
  });
  controls.append(button);
  stateButtons.push(button);
}
controls.append(log);

for (const previewCase of previewCases) {
  const caseElement = document.createElement("section");
  caseElement.className = "titlebar-update-preview__case";

  const label = document.createElement("div");
  label.className = "titlebar-update-preview__case-label";
  label.textContent = previewCase.name;

  const host = document.createElement("div");
  host.className = "titlebar-update-preview__case-host";

  caseElement.append(label, host);
  matrix.append(caseElement);

  new WorkbenchTitlebarPart(host).update(createTitlebarProps(previewCase));
}

function createTitlebarProps(previewCase: PreviewCase): WorkbenchTitlebarProps {
  return {
    activePage: "table",
    canNavigateBack: true,
    canNavigateForward: true,
    chrome: {
      showBrandIcon: true,
      windowControlsSide: "right",
    },
    commandService,
    isAuxiliaryBarExpanded: true,
    isSidebarVisible: true,
    updateAction: previewCase.updateAction,
  };
}

function renderActivePreview(): void {
  const previewCase = previewCases[selectedCaseIndex] ?? previewCases[0];
  activePart.update(createTitlebarProps(previewCase));

  for (const [index, button] of stateButtons.entries()) {
    button.dataset.selected = index === selectedCaseIndex ? "true" : "false";
  }
}

function advanceFakeUpdateFlow(commandId: string): void {
  const previewCase = previewCases[selectedCaseIndex] ?? previewCases[0];
  if (previewCase.updateAction?.commandId !== commandId) {
    return;
  }

  const nextCaseId = previewFlowNextCaseId.get(previewCase.id);
  if (!nextCaseId) {
    return;
  }

  const nextIndex = previewCases.findIndex(candidate => candidate.id === nextCaseId);
  if (nextIndex < 0 || nextIndex === selectedCaseIndex) {
    return;
  }

  selectedCaseIndex = nextIndex;
  renderActivePreview();
}

function renderCommandLog(): void {
  log.textContent = clickedCommands.length
    ? `Clicked: ${clickedCommands.slice(-6).join(", ")}`
    : "Click titlebar actions to log command ids.";
}

renderActivePreview();
renderCommandLog();

const visibleUpdateButton = root.querySelector(".titlebar-update-button");
if (!(visibleUpdateButton instanceof HTMLElement) || !visibleUpdateButton.textContent?.trim()) {
  throw new Error("Titlebar update preview rendered without a visible update action.");
}

if (visibleUpdateButton.textContent.trim() !== "Update") {
  throw new Error(`Titlebar update preview should open on Update, got ${visibleUpdateButton.textContent.trim()}.`);
}
