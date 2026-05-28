import { ANALYSIS_ONBOARDING_CREATE_TEMPLATE_EVENT } from "src/cs/workbench/contrib/template/templateEvents";

const clickElementById = (id: string): boolean => {
  if (typeof document === "undefined") return false;
  const element = document.getElementById(id);
  if (!element || !(element instanceof HTMLElement)) return false;
  element.click();
  return true;
};

export const createTemplateForOnboarding = (): void => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(ANALYSIS_ONBOARDING_CREATE_TEMPLATE_EVENT),
  );
};

export const openTemplateSelectModeForOnboarding = (): boolean =>
  clickElementById("analysis-template-mode-tab-select");

export const openTemplateSaveModeForOnboarding = (): boolean =>
  clickElementById("analysis-template-mode-tab-save");

export const openTemplateDropdownForOnboarding = (): boolean =>
  clickElementById("analysis-template-dropdown-btn");

export const applyTemplateToAllForOnboarding = (): boolean =>
  clickElementById("analysis-template-output-rule-apply-to-all");
