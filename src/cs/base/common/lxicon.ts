export type LxIconRenderer = () => string;

export type LxIconDefinition = LxIcon | LxIconRenderer;

export type LxIcon = {
  readonly id: string;
  readonly render: LxIconRenderer;
};

const iconsById = new Map<string, LxIcon>();

export const registerLxIcon = (id: string, render: LxIconRenderer): LxIcon => {
  const existing = iconsById.get(id);
  if (existing) {
    return existing;
  }

  const icon = { id, render };
  iconsById.set(id, icon);
  return icon;
};

export const getLxIcon = (id: string): LxIcon | undefined => iconsById.get(id);

export const getAllLxIcons = (): readonly LxIcon[] => Array.from(iconsById.values());

export const resolveLxIconRenderer = (icon: LxIconDefinition): LxIconRenderer =>
  typeof icon === "function" ? icon : icon.render;

export const lxAlertCircle = registerLxIcon(
  "alert-circle",
  () =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.5" stroke="#000"/><path stroke="#000" stroke-linecap="round" d="M8 4.75v3.5"/><circle cx="8" cy="11.25" r=".75" fill="#000"/></svg>`,
);

export const lxAlertTriangle = registerLxIcon(
  "alert-triangle",
  () =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 16 16"><path stroke="#000" stroke-linejoin="round" d="M7.118 2.984a1 1 0 0 1 1.764 0l5.008 9.766A1 1 0 0 1 13 14.2H3a1 1 0 0 1-.89-1.45Z"/><path stroke="#000" stroke-linecap="round" d="M8 5.5v3.5"/><circle cx="8" cy="11.4" r=".75" fill="#000"/></svg>`,
);

export const lxCheckCircle = registerLxIcon(
  "check-circle",
  () =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.5" stroke="#000"/><path stroke="#000" stroke-linecap="round" stroke-linejoin="round" d="M11 6 7.25 9.75 5.5 8"/></svg>`,
);

export const lxInfoCircle = registerLxIcon(
  "info-circle",
  () =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.5" stroke="#000"/><path stroke="#000" stroke-linecap="round" d="M8 7v4"/><circle cx="8" cy="4.75" r=".75" fill="#000"/></svg>`,
);

export const lxSlidersHorizontal = registerLxIcon(
  "sliders-horizontal",
  () =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 16 16"><path stroke="#000" stroke-linecap="round" d="M2.5 4h2m3 0h6M2.5 8h6m3 0h1.5M2.5 12h3m3 0h4.5"/><circle cx="6" cy="4" r="1.5" stroke="#000"/><circle cx="10" cy="8" r="1.5" stroke="#000"/><circle cx="7" cy="12" r="1.5" stroke="#000"/></svg>`,
);
