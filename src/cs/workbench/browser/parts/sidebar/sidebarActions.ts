import type {
  WorkbenchSidebarAction,
  WorkbenchSidebarBadge,
  WorkbenchSidebarHeaderAction,
  WorkbenchSidebarSection,
} from "src/cs/workbench/browser/parts/sidebar/sidebarPart";

const isValidSidebarBadge = (
  badge: WorkbenchSidebarBadge | undefined,
): badge is WorkbenchSidebarBadge =>
  !!badge && typeof badge.text === "string" && badge.text.trim().length > 0;

export const normalizeWorkbenchSidebarActions = (
  actions: WorkbenchSidebarAction[] | undefined,
): WorkbenchSidebarAction[] =>
  Array.isArray(actions)
    ? actions.filter(
        (action) => !!action && typeof action.id === "string" && typeof action.title === "string",
      )
    : [];

export const normalizeWorkbenchSidebarHeaderActions = (
  actions: WorkbenchSidebarHeaderAction[] | undefined,
): WorkbenchSidebarHeaderAction[] =>
  Array.isArray(actions)
    ? actions
        .filter(
          (action) =>
            !!action && typeof action.id === "string" && typeof action.title === "string",
        )
        .map((action) => ({
          ...action,
          kind: action.kind ?? "secondary",
        }))
    : [];

export const normalizeWorkbenchSidebarSections = (
  sections: WorkbenchSidebarSection[] | undefined,
): WorkbenchSidebarSection[] =>
  Array.isArray(sections)
    ? sections
        .filter(
          (section) =>
            !!section &&
            typeof section.id === "string" &&
            typeof section.title === "string",
        )
        .map((section) => ({
          ...section,
          badge: isValidSidebarBadge(section.badge) ? section.badge : undefined,
          actions: normalizeWorkbenchSidebarActions(section.actions),
        }))
    : [];

export const getWorkbenchSidebarActionClassName = (
  action: WorkbenchSidebarAction,
): string => {
  const tokens = ["workbench_sidebar_action"];

  if (action.isActive) {
    tokens.push("workbench_sidebar_action--active");
  }

  if (action.isDanger) {
    tokens.push("workbench_sidebar_action--danger");
  }

  return tokens.join(" ");
};
