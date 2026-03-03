import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { normalizeCtaName, normalizeCtaToken } from "../../utils/cta";

const cx = (...parts) => parts.filter(Boolean).join(" ");

const slugify = (input) =>
  String(input ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

const Tabs = ({
  options = [], // [{ value, label, icon?, ariaLabel?, disabled?, testId?, id?, panelId? }]
  value,
  onChange,
  className = "",
  itemClassName = "",
  keyboardActivation = "auto", // "auto" | "manual"
  hoverPreview = true, // visual only: highlight on hover without changing selection
  controlsPanels = false, // when true, Tabs links to external tabpanels via aria-controls
  groupLabel,
  dataUi,
  testId,
  idBase,
  panelIdBase,
  panelIdMode = "scoped", // "scoped" | "short"
  renderPanel, // (option, { index, isSelected }) => ReactNode
  keepMounted = false, // keep inactive panels mounted (hidden) after first visit
  size = "md", // "sm" | "md"
  ...restProps
}) => {
  const safeOptions = useMemo(
    () => (Array.isArray(options) ? options : []),
    [options],
  );
  const reactId = useId();
  const buttonRefs = useRef([]);
  const [hoveredValue, setHoveredValue] = useState(null);

  const uiMarker =
    typeof dataUi === "string" && dataUi.trim() ? dataUi.trim() : undefined;
  const devTestId = import.meta.env.DEV && testId ? testId : undefined;

  if (import.meta.env.DEV && dataUi != null) {
    console.warn(
      "[Tabs] `dataUi` is legacy. Prefer `idBase` + stable `id` / `data-cta*` / `aria-*` instead.",
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
  const resolvedHoverPreview = !!hoverPreview;
  const shouldLinkPanels =
    typeof renderPanel === "function" || Boolean(controlsPanels);

  const normalizedOptions = useMemo(() => {
    const seenValues = new Set();
    const usedTokens = new Set();

    return safeOptions.map((option, index) => {
      const optionValue = option?.value;
      const baseTokenRaw =
        optionValue !== undefined
          ? optionValue
          : option?.label != null
            ? option.label
            : `item-${index}`;

      let token = slugify(baseTokenRaw);
      if (!token) token = `item-${index}`;
      if (usedTokens.has(token)) token = `${token}-${index}`;
      usedTokens.add(token);

      const tabId = option?.id ?? `${instanceId}-tab-${token}`;
      const panelId = shouldLinkPanels
        ? panelIdMode === "short"
          ? option?.panelId ??
            (shortPanelPrefix ? `${shortPanelPrefix}-${token}` : token)
          : option?.panelId ?? `${panelPrefix}-${token}`
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

        if (shouldLinkPanels && hasExplicitIdBase && option?.panelId) {
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
        __disabled: !!option?.disabled,
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
    () => normalizedOptions.findIndex((o) => o?.value === value),
    [normalizedOptions, value],
  );
  const hasSelectedValue = selectedIndex >= 0;

  const firstEnabledIndex = useMemo(
    () => normalizedOptions.findIndex((o) => !o?.__disabled),
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

  const [mountedValues, setMountedValues] = useState(() => new Set());

  useEffect(() => {
    if (!keepMounted || typeof renderPanel !== "function") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMountedValues((prev) => {
      if (prev.has(value)) return prev;
      const next = new Set(prev);
      next.add(value);
      return next;
    });
  }, [keepMounted, renderPanel, value]);

  const noteMounted = (nextValue) => {
    if (!keepMounted || typeof renderPanel !== "function") return;
    setMountedValues((prev) => {
      const next = new Set(prev);
      if (value !== undefined) next.add(value);
      if (nextValue !== undefined) next.add(nextValue);
      return next.size === prev.size ? prev : next;
    });
  };

  const focusAtIndex = (idx) => {
    const el = buttonRefs.current?.[idx];
    if (el && typeof el.focus === "function") el.focus();
  };

  const findNextEnabledIndex = (fromIndex, dir) => {
    const len = normalizedOptions.length;
    if (len <= 0) return -1;

    for (let i = 0; i < len; i++) {
      const nextIndex = (fromIndex + dir * (i + 1) + len) % len;
      if (!normalizedOptions[nextIndex]?.__disabled) return nextIndex;
    }
    return -1;
  };

  const moveSelection = (currentIndex, dir) => {
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

  const activateAtIndex = (idx) => {
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
          resolvedHoverPreview && hoveredValue != null ? hoveredValue : value;
        const isVisuallyActive = resolvedVisualValue === option.value;

        const ariaLabel = option?.ariaLabel;
        const optionTestId =
          import.meta.env.DEV && option?.testId ? option.testId : undefined;
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
            aria-label={ariaLabel}
            aria-selected={isSelected}
            aria-controls={panelId}
            tabIndex={tabIndex}
            disabled={isDisabled}
            data-icon={Icon ? "with" : "without"}
            data-tabs="tab"
            data-ui={uiMarker ? `${uiMarker}-tab-${token}` : undefined}
            data-cta={normalizeCtaName(option?.cta)}
            data-cta-position={normalizeCtaToken(option?.ctaPosition)}
            data-cta-copy={normalizeCtaToken(option?.ctaCopy)}
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
              if (resolvedHoverPreview) setHoveredValue(option.value);
            }}
            onMouseLeave={() => {
              if (resolvedHoverPreview) setHoveredValue(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft") {
                e.preventDefault();
                moveSelection(index, -1);
              } else if (e.key === "ArrowRight") {
                e.preventDefault();
                moveSelection(index, 1);
              } else if (e.key === "Home") {
                e.preventDefault();
                const idx = firstEnabled();
                if (idx < 0) return;
                focusAtIndex(idx);
                if (keyboardActivation !== "manual") activateAtIndex(idx);
              } else if (e.key === "End") {
                e.preventDefault();
                const idx = lastEnabled();
                if (idx < 0) return;
                focusAtIndex(idx);
                if (keyboardActivation !== "manual") activateAtIndex(idx);
              } else if (keyboardActivation === "manual") {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  activateAtIndex(index);
                }
              }
            }}
          >
            {Icon && (
              <span className="tab_btn_icon">
                <Icon size={16} />
              </span>
            )}
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
          const shouldRender = keepMounted
            ? isSelected || mountedValues.has(option.value)
            : isSelected;
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
