import "src/cs/base/browser/ui/tab/tab.css";

export type TabValue = string | number;
export type TabSize = "sm" | "md";
export type KeyboardActivation = "auto" | "manual";
export type PanelIdMode = "scoped" | "short";

export type TabOptionBase = {
  ariaLabel?: string;
  title?: string;
  disabled?: boolean;
  testId?: string;
  id?: string;
  panelId?: string;
};

type TabOptionWithValue<T extends TabOptionBase = TabOptionBase> = T & {
  readonly value: TabValue;
};

export type NormalizedTabOption<T extends TabOptionBase = TabOptionBase> = TabOptionWithValue<T> & {
  __index: number;
  __key: string;
  __tabId: string;
  __panelId?: string;
  __token: string;
  __disabled: boolean;
};

export type NormalizeTabsOptions<T extends TabOptionBase> = {
  controlsPanels?: boolean;
  idBase?: string;
  instanceId: string;
  options: readonly TabOptionWithValue<T>[];
  panelIdBase?: string;
  panelIdMode?: PanelIdMode;
  shouldLinkPanels?: boolean;
};

export const slugifyTabToken = (input: unknown): string =>
  String(input ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

export const getTabsInstanceId = (idBase: string | undefined, fallbackId: string): string => {
  const explicitId = typeof idBase === "string" && idBase.trim();
  return explicitId ? slugifyTabToken(idBase) : `tabs-${fallbackId}`;
};

export const getTabsUiMarker = (dataUi: string | undefined): string | undefined =>
  typeof dataUi === "string" && dataUi.trim() ? dataUi.trim() : undefined;

export const getTabsDevTestId = (testId: string | undefined): string | undefined =>
  import.meta.env.DEV && testId ? testId : undefined;

const joinClassNames = (...classNames: string[]): string =>
  classNames.filter(Boolean).join(" ");

export const getTabsMenuClassName = (className = ""): string =>
  joinClassNames("tab_menu", className);

export const getTabsButtonSizeClassName = (size: TabSize = "md"): string =>
  size === "sm" ? "tab_btn--sm" : "tab_btn--md";

export const getTabsButtonClassName = ({
  className = "",
  isActive,
  size = "md",
}: {
  className?: string;
  isActive: boolean;
  size?: TabSize;
}): string =>
  joinClassNames(
    "tab_btn",
    getTabsButtonSizeClassName(size),
    isActive ? "tab_btn--active" : "tab_btn--inactive",
    className,
  );

export const normalizeTabsOptions = <T extends TabOptionBase>({
  idBase,
  instanceId,
  options,
  panelIdBase,
  panelIdMode = "scoped",
  shouldLinkPanels,
}: NormalizeTabsOptions<T>): NormalizedTabOption<T>[] => {
  const seenValues = new Set<TabValue>();
  const usedTokens = new Set<string>();
  const hasExplicitIdBase = typeof idBase === "string" && idBase.trim();
  const panelPrefix = typeof panelIdBase === "string" && panelIdBase.trim()
    ? panelIdBase.trim()
    : `${instanceId}-panel`;
  const shortPanelPrefix = typeof panelIdBase === "string" && panelIdBase.trim()
    ? slugifyTabToken(panelIdBase)
    : "";

  return options.map((option, index) => {
    const optionValue = option.value;
    let token = slugifyTabToken(optionValue ?? `item-${index}`);
    if (!token) {
      token = `item-${index}`;
    }
    if (usedTokens.has(token)) {
      token = `${token}-${index}`;
    }
    usedTokens.add(token);

    const tabId = option.id ?? `${instanceId}-tab-${token}`;
    const panelId = shouldLinkPanels
      ? panelIdMode === "short"
        ? option.panelId ?? (shortPanelPrefix ? `${shortPanelPrefix}-${token}` : token)
        : option.panelId ?? `${panelPrefix}-${token}`
      : undefined;

    if (import.meta.env.DEV) {
      if (seenValues.has(optionValue)) {
        console.warn("[Tabs] duplicate option.value detected; selection may be ambiguous.", optionValue, options);
      }
      if (shouldLinkPanels && hasExplicitIdBase && option.panelId) {
        console.warn("[Tabs] option.panelId overrides the derived panel id; prefer panelIdBase/panelIdMode for consistency.", { idBase, option });
      }
    }

    seenValues.add(optionValue);

    return {
      ...option,
      __index: index,
      __key: tabId,
      __tabId: tabId,
      __panelId: panelId,
      __token: token,
      __disabled: Boolean(option.disabled),
    };
  });
};
