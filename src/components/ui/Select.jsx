import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import Popup from "./Popup";

const cx = (...parts) => parts.filter(Boolean).join(" ");

const isSelectableOption = (opt) =>
  opt && Object.prototype.hasOwnProperty.call(opt, "value");

const slugify = (input) =>
  String(input ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

const Select = ({
  options = [], // [{ label, value, icon?, group? }]
  value,
  onChange,
  placeholder,
  title,
  disabled = false,
  size = "md", // "sm" | "md" | "xl"
  className = "",
  formatDisplay,
  align = "left",
  zIndex = 20,
  id,
  menuId,
  popupClassName = "min-w-full",
  triggerClassName = "",
  testId,
  ...props
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef(null);

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

  const selectableOptions = useMemo(
    () => (Array.isArray(options) ? options.filter(isSelectableOption) : []),
    [options],
  );

  const selected = useMemo(
    () => selectableOptions.find((opt) => opt.value === value) ?? null,
    [selectableOptions, value],
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
    const map = new Map();
    for (const opt of selectableOptions) {
      const group = opt?.group ? String(opt.group) : "";
      if (!map.has(group)) map.set(group, []);
      map.get(group).push(opt);
    }
    const groups = Array.from(map.keys());
    return { map, groups };
  }, [selectableOptions]);

  const flatOptions = useMemo(() => {
    const flat = [];
    for (const group of grouped.groups) {
      for (const opt of grouped.map.get(group) ?? []) {
        flat.push(opt);
      }
    }
    return flat;
  }, [grouped]);

  const indexedGroups = useMemo(() => {
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

  const selectOption = (opt) => {
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

  const handleKeyDown = (e) => {
    if (disabled) return;

    if (!isOpen) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter") {
        e.preventDefault();
        openMenu();
      }
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      closeMenu();
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        flatOptions.length
          ? (prev + 1 + flatOptions.length) % flatOptions.length
          : -1,
      );
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        flatOptions.length
          ? (prev - 1 + flatOptions.length) % flatOptions.length
          : -1,
      );
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
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

  return (
    <div
      ref={containerRef}
      className={cx("ui-select_warp", className)}
      data-style="select"
      data-disabled={disabled || undefined}
    >
      <div
        className={cx("input_field", sizeClass, "pr-1")}
        data-state={disabled ? "disabled" : "enable"}
      >
        <button
          {...props}
          id={triggerId}
          type="button"
          aria-haspopup="menu"
          aria-expanded={isOpen}
          aria-controls={resolvedMenuId}
          disabled={disabled}
          data-state={isOpen ? "open" : "closed"}
          data-size={size}
          data-testid={devTestId}
          onClick={handleTriggerClick}
          onKeyDown={handleKeyDown}
          className={cx(
            "input_native no-focus-outline p-0 pr-8 text-left cursor-pointer select-none",
            triggerClassName,
          )}
        >
          <span
            className={cx(
              "block truncate",
              hasDisplayValue ? "text-text-primary" : "text-text-tertiary",
            )}
          >
            {hasDisplayValue ? displayNode : placeholder ?? ""}
          </span>
        </button>

        <span className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-secondary pointer-events-none">
          <ChevronDown
            size={16}
            className={cx(
              "transition-transform duration-200",
              isOpen ? "rotate-180" : "",
            )}
          />
        </span>
      </div>

      <Popup
        isOpen={isOpen}
        onClose={closeMenu}
        align={align}
        zIndex={zIndex}
        triggerId={triggerId}
        menuId={resolvedMenuId}
        containerRef={containerRef}
        className={popupClassName}
      >
        {() => (
          <>
            {title ? <div className="ui-select_title">{title}</div> : null}

            <div className="ui-select_list">
              {indexedGroups.map(({ group, options }, groupIdx) => (
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

                  {options.map(({ option, index: currentIndex }) => {
                    const isHighlighted = highlightedIndex === currentIndex;
                    const isSelected = value === option.value;
                    const Icon = option.icon;

                    return (
                      <button
                        key={String(option.value)}
                        type="button"
                        role="menuitem"
                        tabIndex={-1}
                        data-highlighted={isHighlighted || undefined}
                        data-selected={isSelected || undefined}
                        data-value={String(option.value)}
                        onClick={() => selectOption(option)}
                        onMouseEnter={() => setHighlightedIndex(currentIndex)}
                        className="ui-select_item"
                      >
                        <span className="ui-select_item-left">
                          {Icon ? (
                            <Icon style={{ width: "0.9rem", height: "0.9rem" }} />
                          ) : null}
                          <span className="truncate">
                            {option.label ?? String(option.value)}
                          </span>
                        </span>
                        {isSelected ? (
                          <Check
                            style={{ width: "0.9rem", height: "0.9rem" }}
                            className="text-accent"
                          />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ))}

              {flatOptions.length === 0 ? (
                <div className="ui-select_empty">No options</div>
              ) : null}
            </div>
          </>
        )}
      </Popup>
    </div>
  );
};

export default Select;
