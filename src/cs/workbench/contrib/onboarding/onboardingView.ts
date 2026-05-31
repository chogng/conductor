import {
  getButtonClassName,
  getButtonContentClassName,
} from "cs/base/browser/ui/button/button";
import type { TranslateFn } from "src/cs/platform/language/common/language";
import type { OnboardingStep } from "src/cs/workbench/contrib/onboarding/onboardingTypes";
import { CARD_HEIGHT } from "src/cs/workbench/contrib/onboarding/onboardingGeometry";

type OnboardingProps = {
  isOpen: boolean;
  stepIndex: number;
  steps: OnboardingStep[];
  t: TranslateFn;
  canNext?: boolean;
  onBack: () => void;
  onClose: () => void;
  onNext: () => void;
};

const Onboarding = (props: OnboardingProps): any => createOnboardingView(props);

export const createOnboardingView = ({
  canNext = true,
  isOpen,
  onBack,
  onClose,
  onNext,
  stepIndex,
  steps,
  t,
}: OnboardingProps): HTMLElement | null => {
  const step = steps[stepIndex] ?? null;
  if (!isOpen || !step) {
    return null;
  }

  const totalSteps = steps.length;
  const isLastStep = stepIndex >= totalSteps - 1;
  const progressStepIds = getProgressStepIds(steps);
  const currentProgressStepId = step.progressGroupId ?? step.id;
  const resolvedProgressStepIndex = progressStepIds.indexOf(currentProgressStepId);
  const progressStepIndex =
    resolvedProgressStepIndex >= 0 ? resolvedProgressStepIndex : stepIndex;
  const totalProgressSteps = progressStepIds.length || totalSteps;

  const root = document.createElement("div");
  root.className = "pointer-events-none fixed inset-0 z-[120] text-text-primary";
  root.setAttribute("aria-live", "polite");

  const backdrop = document.createElement("div");
  backdrop.className = "absolute inset-0";
  backdrop.style.background = `rgba(0,0,0,${step.backdropOpacity ?? 0.58})`;
  root.append(backdrop);

  const card = document.createElement("div");
  card.className =
    "pointer-events-auto fixed left-1/2 top-1/2 flex flex-col overflow-hidden rounded-[24px] border border-border bg-bg-surface p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)]";
  card.style.width = "min(420px, calc(100vw - 32px))";
  card.style.height = `${CARD_HEIGHT}px`;
  card.style.transform = "translate(-50%, -50%)";
  card.role = "dialog";
  card.setAttribute("aria-modal", "true");
  card.setAttribute("aria-labelledby", "analysis-onboarding-title");

  card.append(
    createHeader({
      current: progressStepIndex + 1,
      onClose,
      t,
      total: totalProgressSteps,
    }),
    createBody({
      body: t(step.bodyKey),
      title: t(step.titleKey),
    }),
    createFooter({
      canNext,
      isFirstStep: stepIndex === 0,
      isLastStep,
      onBack,
      onNext,
      progressStepIds,
      progressStepIndex,
      t,
    }),
  );
  root.append(card);
  return root;
};

const createHeader = ({
  current,
  onClose,
  t,
  total,
}: {
  readonly current: number;
  readonly onClose: () => void;
  readonly t: TranslateFn;
  readonly total: number;
}): HTMLElement => {
  const header = document.createElement("div");
  header.className = "mb-3 flex items-center justify-between gap-3";

  const progress = document.createElement("div");
  progress.className =
    "text-xs font-medium uppercase tracking-[0.18em] text-text-secondary";
  progress.textContent = t("da_onboarding_progress", { current, total });

  const skip = document.createElement("button");
  skip.type = "button";
  skip.className =
    "rounded-full px-2 py-1 text-sm text-text-secondary transition hover:bg-bg-page hover:text-text-primary";
  skip.textContent = t("da_onboarding_skip");
  skip.addEventListener("click", onClose);
  header.append(progress, skip);
  return header;
};

const createBody = ({
  body,
  title,
}: {
  readonly body: string;
  readonly title: string;
}): HTMLElement => {
  const fragment = document.createElement("div");
  const heading = document.createElement("h3");
  heading.id = "analysis-onboarding-title";
  heading.className = "text-lg font-semibold text-text-primary";
  heading.textContent = title;

  const bodyWrap = document.createElement("div");
  bodyWrap.className = "mt-2 min-h-0 flex-1 overflow-y-auto pr-1";
  const paragraph = document.createElement("p");
  paragraph.className = "text-sm leading-6 text-text-secondary";
  paragraph.textContent = body;
  bodyWrap.append(paragraph);
  fragment.append(heading, bodyWrap);
  return fragment;
};

const createFooter = ({
  canNext,
  isFirstStep,
  isLastStep,
  onBack,
  onNext,
  progressStepIds,
  progressStepIndex,
  t,
}: {
  readonly canNext: boolean;
  readonly isFirstStep: boolean;
  readonly isLastStep: boolean;
  readonly onBack: () => void;
  readonly onNext: () => void;
  readonly progressStepIds: string[];
  readonly progressStepIndex: number;
  readonly t: TranslateFn;
}): HTMLElement => {
  const footer = document.createElement("div");
  footer.className = "mt-4 flex items-center justify-between gap-3";

  const left = document.createElement("div");
  left.className = "flex items-center gap-2";
  left.append(
    createButton({
      disabled: isFirstStep,
      label: t("da_onboarding_back"),
      onClick: onBack,
      variant: "ghost",
    }),
  );

  const dots = document.createElement("div");
  dots.className = "flex items-center gap-2";
  progressStepIds.forEach((progressId, index) => {
    const dot = document.createElement("span");
    dot.className = `h-2 rounded-full transition-all ${
      index === progressStepIndex ? "w-6 bg-[#222222]" : "w-2 bg-border"
    }`;
    dot.setAttribute("aria-hidden", "true");
    dot.dataset.progressId = progressId;
    dots.append(dot);
  });

  footer.append(
    left,
    dots,
    createButton({
      disabled: !canNext,
      label: isLastStep ? t("da_onboarding_finish") : t("da_onboarding_next"),
      onClick: onNext,
      variant: "primary",
    }),
  );
  return footer;
};

const createButton = ({
  disabled,
  label,
  onClick,
  variant,
}: {
  readonly disabled?: boolean;
  readonly label: string;
  readonly onClick: () => void;
  readonly variant: "ghost" | "primary";
}): HTMLButtonElement => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = getButtonClassName({
    disabled,
    size: "sm",
    variant,
  });
  button.disabled = Boolean(disabled);
  button.addEventListener("click", onClick);
  const content = document.createElement("span");
  content.className = getButtonContentClassName();
  content.textContent = label;
  button.append(content);
  return button;
};

const getProgressStepIds = (steps: OnboardingStep[]): string[] => {
  const ids: string[] = [];
  for (const entry of steps) {
    const progressId = entry.progressGroupId ?? entry.id;
    if (!ids.includes(progressId)) {
      ids.push(progressId);
    }
  }
  return ids;
};

export default Onboarding;
