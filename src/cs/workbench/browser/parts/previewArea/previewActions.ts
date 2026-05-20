import type {
  WorkbenchPreviewAreaAction,
  WorkbenchPreviewAreaBadge,
  WorkbenchPreviewAreaHeaderAction,
} from "src/cs/workbench/browser/parts/previewArea/previewPart";

const isValidPreviewAreaBadge = (
  badge: WorkbenchPreviewAreaBadge | undefined,
): badge is WorkbenchPreviewAreaBadge =>
  !!badge && typeof badge.text === "string" && badge.text.trim().length > 0;

export const normalizeWorkbenchPreviewAreaActions = (
  actions: WorkbenchPreviewAreaAction[] | undefined,
): WorkbenchPreviewAreaAction[] =>
  Array.isArray(actions)
    ? actions
        .filter(
          (action) =>
            !!action &&
            typeof action.id === "string" &&
            typeof action.title === "string",
        )
        .map((action) => ({
          ...action,
          badge: isValidPreviewAreaBadge(action.badge)
            ? action.badge
            : undefined,
        }))
    : [];

export const normalizeWorkbenchPreviewAreaHeaderActions = (
  actions: WorkbenchPreviewAreaHeaderAction[] | undefined,
): WorkbenchPreviewAreaHeaderAction[] =>
  Array.isArray(actions)
    ? actions
        .filter(
          (action) =>
            !!action &&
            typeof action.id === "string" &&
            typeof action.title === "string",
        )
        .map((action) => ({
          ...action,
          badge: isValidPreviewAreaBadge(action.badge)
            ? action.badge
            : undefined,
          kind: action.kind ?? "secondary",
        }))
    : [];

export const getWorkbenchPreviewAreaActionClassName = (
  action: WorkbenchPreviewAreaAction,
): string => {
  const tokens = ["workbench_preview_area_action"];

  if (action.isActive) {
    tokens.push("workbench_preview_area_action--active");
  }

  if (action.isDanger) {
    tokens.push("workbench_preview_area_action--danger");
  }

  return tokens.join(" ");
};
