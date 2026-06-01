export const DEFAULT_WORKBENCH_BACKGROUND_COLOR = "#f3f4f6";

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

export type WorkbenchAppearance = {
  readonly backgroundColor: string;
  readonly transparentChrome: boolean;
};

export const normalizeWorkbenchBackgroundColor = (
  value: unknown,
): string =>
  typeof value === "string" && HEX_COLOR_PATTERN.test(value.trim())
    ? value.trim().toLowerCase()
    : DEFAULT_WORKBENCH_BACKGROUND_COLOR;

export const normalizeWorkbenchAppearance = (
  value: unknown,
): WorkbenchAppearance => {
  const raw = value && typeof value === "object"
    ? value as Record<string, unknown>
    : {};

  return {
    backgroundColor: normalizeWorkbenchBackgroundColor(raw.backgroundColor),
    transparentChrome: raw.transparentChrome === true,
  };
};

export const applyWorkbenchAppearance = (
  appearance: WorkbenchAppearance,
): void => {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.style.setProperty(
    "--bg-page",
    hexToRgbTriplet(appearance.backgroundColor),
  );
  document.documentElement.dataset.transparentChrome =
    appearance.transparentChrome ? "true" : "false";
};

const hexToRgbTriplet = (hex: string): string => {
  const normalized = normalizeWorkbenchBackgroundColor(hex);
  const value = normalized.slice(1);
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);

  return `${red} ${green} ${blue}`;
};
