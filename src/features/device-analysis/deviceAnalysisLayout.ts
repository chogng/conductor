export const DEFAULT_DEVICE_ANALYSIS_SIDEBAR_WIDTH_PX = 280;
export const MIN_DEVICE_ANALYSIS_SIDEBAR_WIDTH_PX = 200;
export const MAX_DEVICE_ANALYSIS_SIDEBAR_WIDTH_PX = 600;

// Keep transfer actions readable when the sidebar is manually narrowed.
export const DEVICE_ANALYSIS_TEMPLATE_TRANSFER_STACK_THRESHOLD_PX = 260;

export const shouldStackTemplateTransferButtons = (
  sidebarWidth: number | undefined | null,
): boolean => {
  if (!Number.isFinite(sidebarWidth)) return false;

  return (
    Number(sidebarWidth) < DEVICE_ANALYSIS_TEMPLATE_TRANSFER_STACK_THRESHOLD_PX
  );
};
