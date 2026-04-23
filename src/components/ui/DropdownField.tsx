import {
  isValidElement,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ComponentType,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { Check, ChevronDown } from "lucide-react";
import { cx } from "../../utils/cx";
import ContentView, { type ContentViewAlign } from "./ContentView";
import Dropdown from "./Dropdown";
import DropdownTrigger from "./DropdownTrigger";
import MenuItem from "./MenuItem";
import ScrollArea from "./ScrollArea";

const hasWidthConstraintClass = (className: string): boolean => {
  if (!className.trim()) return false;

  return className
    .split(/\s+/)
    .map((token) => token.split(":").pop() ?? token)
    .some((baseToken) => {
      if (
        baseToken.startsWith("min-w-") ||
        baseToken.startsWith("max-w-") ||
        baseToken.startsWith("basis-")
      ) {
        return true;
      }

      if (!baseToken.startsWith("w-")) return false;
      if (
        baseToken === "w-fit" ||
        baseToken === "w-auto" ||
        baseToken === "w-min" ||
        baseToken === "w-max"
      ) {
        return false;
      }

      return true;
    });
};

type DropdownFieldValue = string | number;
type DropdownFieldSize = "sm" | "md" | "xl";

type DropdownFieldIconComponent = ComponentType<{
  style?: CSSProperties;
  className?: string;
}>;

type DropdownFieldOption = {
  label?: ReactNode;
  value: DropdownFieldValue;
  icon?: DropdownFieldIconComponent;
  group?: string;
};

type IndexedGroup = {
  group: string;
  options: Array<{ option: DropdownFieldOption; index: number }>;
};

type DropdownFieldProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "onChange" | "value" | "size"
> & {
  options?: DropdownFieldOption[];
  value?: DropdownFieldValue;
  onChange?: (nextValue: DropdownFieldValue) => void;
  placeholder?: ReactNode;
  title?: ReactNode;
  disabled?: boolean;
  size?: DropdownFieldSize;
  className?: string;
  formatDisplay?: (selected: DropdownFieldOption | null) => ReactNode;
  align?: ContentViewAlign;
  zIndex?: number;
  id?: string;
  menuId?: string;
  popupClassName?: string;
  triggerClassName?: string;
  testId?: string;
  stableWidth?: boolean;
  hideChevron?: boolean;
};

const isSelectableOption = (opt: unknown): opt is DropdownFieldOption => {
  if (!opt || typeof opt !== "object") return false;
  if (!Object.prototype.hasOwnProperty.call(opt, "value")) return false;
  const value = (opt as { value: unknown }).value;
  return typeof value === "string" || typeof value === "number";
};

const slugify = (input: unknown): string =>
  String(input ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

const getNodePlainText = (node: ReactNode): string => {
  if (node === null || node === undefined || typeof node === "boolean")
    return "";
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map((item) => getNodePlainText(item)).join("");
  }
  if (isValidElement(node)) {
    const children = (node.props as { children?: ReactNode } | null)?.children;
    return getNodePlainText(children);
  }
  return "";
};

const DropdownField = ({
  options = [],
  value,
  onChange,
  placeholder,
  title,
  disabled = false,
  size = "md",
  className = "",
  formatDisplay,
  align = "left",
  zIndex = 20,
  id,
  menuId,
  popupClassName = "min-w-full",
  triggerClassName = "",
  testId,
  stableWidth,
  hideChevron = false,
  ...props
}: DropdownFieldProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [stableWidthPx, setStableWidthPx] = useState<number | undefined>(
    undefined,
  );

  const internalTriggerId = useId();
  const internalMenuId = useId();
  const triggerId = id || `select-${slugify(internalTriggerId)}`;
  const resolvedMenuId = menuId || `select-menu-${slugify(internalMenuId)}`;
  const devTestId = import.meta.env.DEV && testId ? testId : undefined;

  const sizeClass =
    size === "sm"
      ? "ui-select_field--sm"
      : size === "xl"
        ? "ui-select_field--xl"
        : "ui-select_field--md";
  const itemSizeClass = size === "sm" ? "text-xs" : "text-sm";
  const chevronIconSizePx = size === "sm" ? 16 : 16;
  const checkIconSizePx = size === "sm" ? 14 : 16;

  const selectableOptions = useMemo(
    () => (Array.isArray(options) ? options.filter(isSelectableOption) : []),
    [options],
  );

  const selected = useMemo(
    () => selectableOptions.find((opt) => opt.value === value) ?? null,
    [selectableOptions, value],
  );
  const shouldStabilizeWidth = useMemo(
    () => stableWidth ?? !hasWidthConstraintClass(className),
    [stableWidth, className],
  );

  const displayNode = useMemo(() => {
    if (typeof formatDisplay === "function") {
      const formatted = formatDisplay(selected);
      if (formatted !== undefined && formatted !== null) return formatted;
    }
    if (selected?.label !== undefined && selected?.label !== null) {
      return selected.label;
    }
    if (value !== undefined && value !== null) return String(value);
    return "";
  }, [formatDisplay, selected, value]);

  const grouped = useMemo(() => {
    const map = new Map<string, DropdownFieldOption[]>();
    for (const opt of selectableOptions) {
      const group = opt.group ? String(opt.group) : "";
      if (!map.has(group)) map.set(group, []);
      map.get(group)?.push(opt);
    }
    return { map, groups: Array.from(map.keys()) };
  }, [selectableOptions]);

  const flatOptions = useMemo(() => {
    const flat: DropdownFieldOption[] = [];
    for (const group of grouped.groups) {
      for (const opt of grouped.map.get(group) ?? []) {
        flat.push(opt);
      }
    }
    return flat;
  }, [grouped]);

  const indexedGroups = useMemo<IndexedGroup[]>(() => {
    let nextIndex = 0;
    return grouped.groups.map((group) => ({
      group,
      options: (grouped.map.get(group) ?? []).map((opt) => ({
        option: opt,
        index: nextIndex++,
      })),
    }));
  }, [grouped]);

  const openMenu = () => {
    if (disabled) return;
    setIsOpen(true);
    const selectedIdx = selected
      ? flatOptions.findIndex((opt) => opt.value === selected.value)
      : -1;
    setHighlightedIndex(selectedIdx >= 0 ? selectedIdx : 0);
  };

  const closeMenu = () => {
    setIsOpen(false);
    setHighlightedIndex(-1);
  };

  const selectOption = (opt: DropdownFieldOption | undefined) => {
    if (!opt) return;
    onChange?.(opt.value);
    closeMenu();
  };

  const handleTriggerClick = () => {
    if (disabled) return;
    setIsOpen((prev) => {
      const next = !prev;
      if (next) {
        const selectedIdx = selected
          ? flatOptions.findIndex((opt) => opt.value === selected.value)
          : -1;
        setHighlightedIndex(selectedIdx >= 0 ? selectedIdx : 0);
      } else {
        setHighlightedIndex(-1);
      }
      return next;
    });
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;

    if (!isOpen) {
      if (
        event.key === "ArrowDown" ||
        event.key === "ArrowUp" ||
        event.key === "Enter"
      ) {
        event.preventDefault();
        openMenu();
      }
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedIndex((prev) =>
        flatOptions.length
          ? (prev + 1 + flatOptions.length) % flatOptions.length
          : -1,
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((prev) =>
        flatOptions.length
          ? (prev - 1 + flatOptions.length) % flatOptions.length
          : -1,
      );
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const opt = flatOptions[highlightedIndex];
      if (opt) selectOption(opt);
    }
  };

  // Keep highlight in-range if options change while open.
  useEffect(() => {
    if (!isOpen) return;
    if (!flatOptions.length) {
      setHighlightedIndex(-1);
      return;
    }
    setHighlightedIndex((prev) =>
      prev < 0 ? 0 : Math.min(prev, flatOptions.length - 1),
    );
  }, [flatOptions.length, isOpen]);

  const hasDisplayValue = (() => {
    if (displayNode === undefined || displayNode === null) return false;
    if (typeof displayNode === "string") return displayNode.trim().length > 0;
    return true;
  })();

  const stableWidthTextCandidates = useMemo(() => {
    if (!shouldStabilizeWidth) return [];

    const optionTexts = selectableOptions
      .map((opt) => getNodePlainText(opt.label ?? String(opt.value)).trim())
      .filter((text) => text.length > 0);

    const displayText = getNodePlainText(displayNode).trim();
    if (displayText.length > 0) optionTexts.push(displayText);

    const placeholderText = getNodePlainText(placeholder).trim();
    if (placeholderText.length > 0) optionTexts.push(placeholderText);

    return optionTexts;
  }, [shouldStabilizeWidth, selectableOptions, displayNode, placeholder]);

  useLayoutEffect(() => {
    if (!shouldStabilizeWidth) {
      setStableWidthPx(undefined);
      return;
    }

    const triggerEl = triggerRef.current;
    const fieldEl = triggerEl?.parentElement;
    if (!triggerEl || !fieldEl) return;

    const measure = () => {
      const triggerStyles = window.getComputedStyle(triggerEl);
      const fieldStyles = window.getComputedStyle(fieldEl);

      const triggerPaddingRight =
        Number.parseFloat(triggerStyles.paddingRight) || 0;
      const triggerPaddingLeft =
        Number.parseFloat(triggerStyles.paddingLeft) || 0;
      const fieldPaddingLeft = Number.parseFloat(fieldStyles.paddingLeft) || 0;
      const fieldPaddingRight = Number.parseFloat(fieldStyles.paddingRight) || 0;
      const fieldBorderLeft = Number.parseFloat(fieldStyles.borderLeftWidth) || 0;
      const fieldBorderRight =
        Number.parseFloat(fieldStyles.borderRightWidth) || 0;

      const font =
        triggerStyles.font ||
        `${triggerStyles.fontStyle} ${triggerStyles.fontVariant} ${triggerStyles.fontWeight} ${triggerStyles.fontSize}/${triggerStyles.lineHeight} ${triggerStyles.fontFamily}`;

      const letterSpacingRaw = triggerStyles.letterSpacing;
      const letterSpacing =
        letterSpacingRaw && letterSpacingRaw !== "normal"
          ? Number.parseFloat(letterSpacingRaw)
          : 0;

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.font = font;

      const texts = stableWidthTextCandidates.length
        ? stableWidthTextCandidates
        : [" "];

      let maxTextWidth = 0;
      for (const text of texts) {
        const safeText = text.length > 0 ? text : " ";
        let nextWidth = ctx.measureText(safeText).width;
        if (letterSpacing && Number.isFinite(letterSpacing) && safeText.length > 1) {
          nextWidth += letterSpacing * (safeText.length - 1);
        }
        maxTextWidth = Math.max(maxTextWidth, nextWidth);
      }

      const triggerWidthPx =
        maxTextWidth +
          triggerPaddingLeft +
          triggerPaddingRight +
          fieldPaddingLeft +
          fieldPaddingRight +
          fieldBorderLeft +
          fieldBorderRight;

      const popupShellHorizontalPx = 10;
      const menuItemHorizontalPaddingPx = 12;
      const menuItemRightAdornmentPx = 28;
      const menuWidthPx =
        maxTextWidth +
        popupShellHorizontalPx +
        menuItemHorizontalPaddingPx +
        menuItemRightAdornmentPx;

      const nextWidthPx = Math.ceil(
        Math.max(triggerWidthPx, menuWidthPx),
      );

      setStableWidthPx((prev) => (prev === nextWidthPx ? prev : nextWidthPx));
    };

    measure();

    let cancelled = false;
    document.fonts?.ready
      .then(() => {
        if (!cancelled) measure();
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [
    shouldStabilizeWidth,
    stableWidthTextCandidates,
    sizeClass,
    triggerClassName,
  ]);

  return (
    <div
      ref={containerRef}
      className={cx("ui-select_warp", className)}
      style={
        stableWidthPx !== undefined
          ? ({
              minWidth: `${stableWidthPx}px`,
            } as CSSProperties)
          : undefined
      }
      data-style="select"
      data-disabled={disabled || undefined}
    >
      <DropdownTrigger
        {...props}
        ref={triggerRef}
        id={triggerId}
        isOpen={isOpen}
        menuId={resolvedMenuId}
        disabled={disabled}
        data-size={size}
        data-testid={devTestId}
        onClick={handleTriggerClick}
        onKeyDown={handleKeyDown}
        fieldClassName={cx("input_field", sizeClass, !hideChevron && "pr-1")}
        className={cx(
          "input_native no-focus-outline p-0 text-left cursor-pointer select-none",
          hideChevron ? "pr-0" : "pr-6",
          triggerClassName,
        )}
        hideIndicator={hideChevron}
        indicatorClassName="absolute right-1 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none"
        indicator={
          <ChevronDown
            size={chevronIconSizePx}
            className={cx(
              "transition-transform duration-200",
              isOpen ? "rotate-180" : "",
            )}
          />
        }
      >
        <span
          className={cx(
            "block truncate",
            hasDisplayValue ? "text-text-primary" : "text-text-tertiary",
          )}
        >
          {hasDisplayValue ? displayNode : placeholder ?? ""}
        </span>
      </DropdownTrigger>

      <Dropdown
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        anchorRef={containerRef}
      >
        {({ anchorRef, setContentRef }) => (
          <ContentView
            isOpen={isOpen}
            align={align}
            zIndex={zIndex}
            matchAnchorWidth
            triggerId={triggerId}
            menuId={resolvedMenuId}
            anchorRef={anchorRef}
            contentRef={setContentRef}
            className={popupClassName}
          >
            {() => (
              <>
                {title ? <div>{title}</div> : null}

                <ScrollArea
                  className="ui-select_scroll-area max-h-60 -mr-1 pr-1"
                  axis="y"
                  viewportClassName="max-h-60"
                  viewportProps={{
                    style: { height: "auto", maxHeight: "15rem" },
                  }}
                >
                  <div className="ui-select_list">
                    {indexedGroups.map(({ group, options: groupOptions }, groupIdx) => (
                      <div key={group || "default"} role={group ? "group" : undefined}>
                        {group ? (
                          <>
                            {groupIdx > 0 ? (
                              <div
                                role="separator"
                                aria-orientation="horizontal"
                                className="ui-select_separator"
                              />
                            ) : null}
                            <div className="ui-select_group">{group}</div>
                          </>
                        ) : null}

                        {groupOptions.map(({ option, index: currentIndex }) => {
                          const isHighlighted = highlightedIndex === currentIndex;
                          const isSelected = value === option.value;
                          const Icon = option.icon;

                          return (
                            <MenuItem
                              key={String(option.value)}
                              tabIndex={-1}
                              data-highlighted={isHighlighted || undefined}
                              data-selected={isSelected || undefined}
                              data-value={String(option.value)}
                              onClick={() => selectOption(option)}
                              onMouseEnter={() => setHighlightedIndex(currentIndex)}
                              className={cx("ui-select_item", itemSizeClass)}
                              left={
                                <span className="ui-select_item-left">
                                  {Icon ? (
                                    <Icon
                                      style={{ width: "0.9rem", height: "0.9rem" }}
                                    />
                                  ) : null}
                                  <span className="truncate">
                                    {option.label ?? String(option.value)}
                                  </span>
                                </span>
                              }
                              right={
                                <span
                                  className="ui-select_item-right"
                                  aria-hidden="true"
                                >
                                  {isSelected ? (
                                    <Check
                                      size={checkIconSizePx}
                                      className="text-accent"
                                    />
                                  ) : null}
                                </span>
                              }
                            />
                          );
                        })}
                      </div>
                    ))}

                    {flatOptions.length === 0 ? (
                      <div className="ui-select_empty">No options</div>
                    ) : null}
                  </div>
                </ScrollArea>
              </>
            )}
          </ContentView>
        )}
      </Dropdown>
    </div>
  );
};

export default DropdownField;

