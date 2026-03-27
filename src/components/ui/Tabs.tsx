import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type HTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { normalizeCtaName, normalizeCtaToken } from "../../utils/cta";

const cx = (...parts: Array<string | false | null | undefined>): string =>
  parts.filter(Boolean).join(" ");

const slugify = (input: unknown): string =>
  String(input ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

type TabValue = string | number;
type TabSize = "sm" | "md";
type KeyboardActivation = "auto" | "manual";
type PanelIdMode = "scoped" | "short";

type TabIconComponent = ComponentType<{ size?: number }>;

type TabOption = {
  value?: TabValue;
  label: ReactNode;
  icon?: TabIconComponent;
  ariaLabel?: string;
  disabled?: boolean;
  testId?: string;
  id?: string;
  panelId?: string;
  cta?: string;
  ctaPosition?: string;
  ctaCopy?: string;
};

type NormalizedTabOption = TabOption & {
  __index: number;
  __key: string;
  __tabId: string;
  __panelId?: string;
  __token: string;
  __disabled: boolean;
};

type TabsProps = Omit<HTMLAttributes<HTMLDivElement>, "onChange"> & {
  options?: TabOption[];
  value?: TabValue;
  onChange?: (nextValue: TabValue) => void;
  itemClassName?: string;
  keyboardActivation?: KeyboardActivation;
  hoverPreview?: boolean;
  controlsPanels?: boolean;
  groupLabel?: string;
  dataUi?: string;
  testId?: string;
  idBase?: string;
  panelIdBase?: string;
  panelIdMode?: PanelIdMode;
  renderPanel?: (
    option: NormalizedTabOption,
    context: { index: number; isSelected: boolean },
  ) => ReactNode;
  keepMounted?: boolean;
  size?: TabSize;
};

const Tabs = ({
  options = [],
  value,
  onChange,
  className = "",
  itemClassName = "",
  keyboardActivation = "auto",
  hoverPreview = true,
  controlsPanels = false,
  groupLabel,
  dataUi,
  testId,
  idBase,
  panelIdBase,
  panelIdMode = "scoped",
  renderPanel,
  keepMounted = false,
  size = "md",
  ...restProps
}: TabsProps) => {
  const safeOptions = useMemo(
    () => (Array.isArray(options) ? options : []),
    [options],
  );
  const reactId = useId();
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [hoveredValue, setHoveredValue] = useState<TabValue | null>(null);

  const uiMarker =
    typeof dataUi === "string" && dataUi.trim() ? dataUi.trim() : undefined;
  const devTestId = import.meta.env.DEV && testId ? testId : undefined;

  if (import.meta.env.DEV && dataUi != null) {
    console.warn(
      "[Tabs] Prefer `idBase` + stable `id` / `data-cta*` / `aria-*` for new usage.",
    );
  }

  const hasExplicitIdBase = typeof idBase === "string" && idBase.trim();
  const instanceId = hasExplicitIdBase ? slugify(idBase) : `tabs-${reactId}`;

  const panelPrefix =
    typeof panelIdBase === "string" && panelIdBase.trim()
      ? panelIdBase.trim()
      : `${instanceId}-panel`;
  const shortPanelPrefix =
    typeof panelIdBase === "string" && panelIdBase.trim()
      ? slugify(panelIdBase)
      : "";

  const sizeClass = size === "sm" ? "tab_btn--sm" : "tab_btn--md";
  const resolvedHoverPreview = Boolean(hoverPreview);
  const shouldLinkPanels =
    typeof renderPanel === "function" || Boolean(controlsPanels);

  const normalizedOptions = useMemo<NormalizedTabOption[]>(() => {
    const seenValues = new Set<TabValue>();
    const usedTokens = new Set<string>();

    return safeOptions.map((option, index) => {
      const optionValue = option.value;
      const baseTokenRaw =
        optionValue !== undefined
          ? optionValue
          : option.label != null
            ? option.label
            : `item-${index}`;

      let token = slugify(baseTokenRaw);
      if (!token) token = `item-${index}`;
      if (usedTokens.has(token)) token = `${token}-${index}`;
      usedTokens.add(token);

      const tabId = option.id ?? `${instanceId}-tab-${token}`;
      const panelId = shouldLinkPanels
        ? panelIdMode === "short"
          ? option.panelId ??
            (shortPanelPrefix ? `${shortPanelPrefix}-${token}` : token)
          : option.panelId ?? `${panelPrefix}-${token}`
        : undefined;

      if (import.meta.env.DEV) {
        if (optionValue === undefined) {
          console.warn(
            "[Tabs] option.value is undefined; this tab cannot be selected reliably.",
            option,
          );
        } else if (seenValues.has(optionValue)) {
          console.warn(
            "[Tabs] duplicate option.value detected; selection/keepMounted may be ambiguous.",
            optionValue,
            safeOptions,
          );
        }

        if (shouldLinkPanels && hasExplicitIdBase && option.panelId) {
          console.warn(
            "[Tabs] option.panelId overrides the derived panel id; prefer panelIdBase/panelIdMode for consistency.",
            { idBase, option },
          );
        }
      }

      if (optionValue !== undefined) seenValues.add(optionValue);

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
  }, [
    hasExplicitIdBase,
    idBase,
    instanceId,
    panelIdMode,
    panelPrefix,
    safeOptions,
    shortPanelPrefix,
    shouldLinkPanels,
  ]);

  const selectedIndex = useMemo(
    () => normalizedOptions.findIndex((option) => option.value === value),
    [normalizedOptions, value],
  );
  const hasSelectedValue = selectedIndex >= 0;

  const firstEnabledIndex = useMemo(
    () => normalizedOptions.findIndex((option) => !option.__disabled),
    [normalizedOptions],
  );

  const focusIndex = useMemo(() => {
    if (
      hasSelectedValue &&
      normalizedOptions[selectedIndex] &&
      !normalizedOptions[selectedIndex].__disabled
    ) {
      return selectedIndex;
    }
    return firstEnabledIndex;
  }, [firstEnabledIndex, hasSelectedValue, normalizedOptions, selectedIndex]);

  const [mountedValues, setMountedValues] = useState<Set<TabValue>>(
    () => new Set(),
  );

  useEffect(() => {
    if (!keepMounted || typeof renderPanel !== "function") return;
    if (value === undefined) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMountedValues((prev) => {
      if (prev.has(value)) return prev;
      const next = new Set(prev);
      next.add(value);
      return next;
    });
  }, [keepMounted, renderPanel, value]);

  const noteMounted = (nextValue?: TabValue) => {
    if (!keepMounted || typeof renderPanel !== "function") return;
    setMountedValues((prev) => {
      const next = new Set(prev);
      if (value !== undefined) next.add(value);
      if (nextValue !== undefined) next.add(nextValue);
      return next.size === prev.size ? prev : next;
    });
  };

  const focusAtIndex = (idx: number) => {
    const el = buttonRefs.current[idx];
    if (el && typeof el.focus === "function") el.focus();
  };

  const findNextEnabledIndex = (fromIndex: number, dir: -1 | 1): number => {
    const len = normalizedOptions.length;
    if (len <= 0) return -1;

    for (let i = 0; i < len; i++) {
      const nextIndex = (fromIndex + dir * (i + 1) + len) % len;
      if (!normalizedOptions[nextIndex]?.__disabled) return nextIndex;
    }
    return -1;
  };

  const moveSelection = (currentIndex: number, dir: -1 | 1) => {
    const nextIndex = findNextEnabledIndex(currentIndex, dir);
    if (nextIndex < 0) return;

    focusAtIndex(nextIndex);

    const shouldActivate = keyboardActivation !== "manual";
    if (!shouldActivate) return;

    const nextValue = normalizedOptions[nextIndex]?.value;
    if (nextValue !== undefined) {
      noteMounted(nextValue);
      onChange?.(nextValue);
      setHoveredValue(null);
    }
  };

  const activateAtIndex = (idx: number) => {
    const option = normalizedOptions[idx];
    if (!option || option.__disabled) return;
    if (option.value === undefined) return;
    noteMounted(option.value);
    onChange?.(option.value);
    setHoveredValue(null);
  };

  const firstEnabled = () => firstEnabledIndex;
  const lastEnabled = () => {
    for (let i = normalizedOptions.length - 1; i >= 0; i--) {
      if (!normalizedOptions[i]?.__disabled) return i;
    }
    return -1;
  };

  if (normalizedOptions.length === 0) return null;

  const menu = (
    <div
      role="tablist"
      aria-label={groupLabel}
      data-tabs="menu"
      data-ui={uiMarker}
      data-testid={devTestId}
      className={cx("tab_menu", className)}
      {...restProps}
    >
      {normalizedOptions.map((option, index) => {
        const Icon = option.icon;
        const isSelected = value === option.value;
        const resolvedVisualValue =
          resolvedHoverPreview && hoveredValue !== null ? hoveredValue : value;
        const isVisuallyActive =
          option.value !== undefined && resolvedVisualValue === option.value;

        const optionTestId =
          import.meta.env.DEV && option.testId ? option.testId : undefined;
        const tabId = option.__tabId;
        const panelId = option.__panelId;
        const token = option.__token;
        const isDisabled = option.__disabled;
        const tabIndex = index === focusIndex ? 0 : -1;

        return (
          <button
            key={option.__key}
            type="button"
            role="tab"
            id={tabId}
            aria-label={option.ariaLabel}
            aria-selected={isSelected}
            aria-controls={panelId}
            tabIndex={tabIndex}
            disabled={isDisabled}
            data-icon={Icon ? "with" : "without"}
            data-tabs="tab"
            data-ui={uiMarker ? `${uiMarker}-tab-${token}` : undefined}
            data-cta={normalizeCtaName(option.cta)}
            data-cta-position={normalizeCtaToken(option.ctaPosition)}
            data-cta-copy={normalizeCtaToken(option.ctaCopy)}
            data-testid={optionTestId}
            className={cx(
              "tab_btn",
              sizeClass,
              isVisuallyActive ? "tab_btn--active" : "tab_btn--inactive",
              itemClassName,
            )}
            ref={(el) => {
              buttonRefs.current[index] = el;
            }}
            onClick={() => {
              if (isDisabled) return;
              if (option.value === undefined) return;
              noteMounted(option.value);
              onChange?.(option.value);
              setHoveredValue(null);
            }}
            onMouseEnter={() => {
              if (isDisabled) return;
              if (resolvedHoverPreview) {
                setHoveredValue(option.value ?? null);
              }
            }}
            onMouseLeave={() => {
              if (resolvedHoverPreview) setHoveredValue(null);
            }}
            onKeyDown={(event: ReactKeyboardEvent<HTMLButtonElement>) => {
              if (event.key === "ArrowLeft") {
                event.preventDefault();
                moveSelection(index, -1);
              } else if (event.key === "ArrowRight") {
                event.preventDefault();
                moveSelection(index, 1);
              } else if (event.key === "Home") {
                event.preventDefault();
                const idx = firstEnabled();
                if (idx < 0) return;
                focusAtIndex(idx);
                if (keyboardActivation !== "manual") activateAtIndex(idx);
              } else if (event.key === "End") {
                event.preventDefault();
                const idx = lastEnabled();
                if (idx < 0) return;
                focusAtIndex(idx);
                if (keyboardActivation !== "manual") activateAtIndex(idx);
              } else if (keyboardActivation === "manual") {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  activateAtIndex(index);
                }
              }
            }}
          >
            {Icon ? (
              <span className="tab_btn_icon">
                <Icon size={16} />
              </span>
            ) : null}
            <span className="tab_btn_text">{option.label}</span>
          </button>
        );
      })}
    </div>
  );

  if (typeof renderPanel !== "function") return menu;

  return (
    <div className="w-full">
      {menu}
      <div className="w-full">
        {normalizedOptions.map((option, index) => {
          const tabId = option.__tabId;
          const panelId = option.__panelId;
          const token = option.__token;

          const isSelected = value === option.value;
          const isMountedValue =
            option.value !== undefined && mountedValues.has(option.value);
          const shouldRender = keepMounted ? isSelected || isMountedValue : isSelected;
          if (!shouldRender) return null;

          return (
            <div
              key={`${option.__key}-panel`}
              role="tabpanel"
              id={panelId}
              aria-labelledby={tabId}
              hidden={!isSelected}
              tabIndex={0}
              data-tabs="panel"
              data-ui={uiMarker ? `${uiMarker}-panel-${token}` : undefined}
            >
              {renderPanel(option, { index, isSelected })}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Tabs;
