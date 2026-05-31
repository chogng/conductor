import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import Button from "cs/base/browser/ui/button/button";
import type { TranslateFn } from "src/cs/platform/language/common/language";
import type {
  OnboardingStep,
} from "src/cs/workbench/contrib/onboarding/onboardingTypes";
import {
  areHighlightRectsEqual,
  areRectLikesEqual,
  CARD_HEIGHT,
  CARD_WIDTH,
  clamp,
  computeAnchoredCardPosition,
  computeCardPosition,
  getBoundingRect,
  getInteractionBlockerRects,
  RING_PADDING,
  SPOTLIGHT_PADDING,
  type CardSize,
  type HighlightRect,
  type RectLike,
} from "src/cs/workbench/contrib/onboarding/onboardingGeometry";
import {
  collectHighlightElements,
  getResolvedRingTargetIds,
  getResolvedRingVirtualTargets,
  getSpotlightTargetIds,
  getTargetRects,
  getVirtualRingTargetRects,
  getVirtualSpotlightTargetRects,
  resolveHighlightElement,
} from "src/cs/workbench/contrib/onboarding/onboardingTargets";

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

const Onboarding = ({
  isOpen,
  stepIndex,
  steps,
  t,
  canNext = true,
  onBack,
  onClose,
  onNext,
}: OnboardingProps) => {
  const step = steps[stepIndex] ?? null;
  const cardRef = useRef<HTMLDivElement | null>(null);
  const maskId = useId();
  const [cardSize, setCardSize] = useState<CardSize>({
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
  });
  const [ringRects, setRingRects] = useState<HighlightRect[]>([]);
  const [spotlightRects, setSpotlightRects] = useState<HighlightRect[]>([]);
  const [cardTargetRect, setCardTargetRect] = useState<RectLike | null>(null);
  const [isRingActivated, setIsRingActivated] = useState(false);

  useEffect(() => {
    setIsRingActivated(false);
  }, [isOpen, step?.id]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const element = cardRef.current;
    if (!element) return undefined;

    const updateCardSize = () => {
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      setCardSize({
        width: rect.width,
        height: rect.height,
      });
    };

    updateCardSize();

    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => updateCardSize());
    observer.observe(element);
    return () => observer.disconnect();
  }, [isOpen, stepIndex]);

  useEffect(() => {
    if (!isOpen || !step || typeof document === "undefined") return undefined;
    const activationTargetIds = step.ringActivationTargetIds;
    if (!Array.isArray(activationTargetIds) || activationTargetIds.length === 0) {
      return undefined;
    }

    const handleClick = (event: MouseEvent) => {
      const eventTarget = event.target;
      if (!(eventTarget instanceof Node)) {
        return;
      }

      const shouldActivate = activationTargetIds.some((id) => {
        const rawElement = document.getElementById(id);
        if (!(rawElement instanceof HTMLElement)) {
          return false;
        }

        const resolvedElement = resolveHighlightElement(rawElement);
        return (
          rawElement === eventTarget ||
          resolvedElement === eventTarget ||
          rawElement.contains(eventTarget) ||
          resolvedElement.contains(eventTarget)
        );
      });

      if (shouldActivate) {
        setIsRingActivated(true);
      }
    };

    document.addEventListener("click", handleClick, true);
    return () => {
      document.removeEventListener("click", handleClick, true);
    };
  }, [isOpen, step]);

  useEffect(() => {
    if (!isOpen || !step || typeof window === "undefined") return undefined;

    const ringTargetIds = getResolvedRingTargetIds(step, isRingActivated);
    const ringVirtualTargets = getResolvedRingVirtualTargets(step, isRingActivated);
    const spotlightTargetIds = getSpotlightTargetIds(step);
    const spotlightVirtualTargets = step.spotlightVirtualTargets;
    const cardTargetIds = step.cardTargetIds;
    const ringPadding = step.ringPadding ?? RING_PADDING;
    const spotlightPadding = step.spotlightPadding ?? SPOTLIGHT_PADDING;
    const cardTargetPadding = step.cardTargetPadding ?? 0;

    const updateRect = () => {
      const nextRingRects = [
        ...getTargetRects(ringTargetIds, ringPadding),
        ...getVirtualRingTargetRects(ringVirtualTargets, ringPadding),
      ];
      const nextSpotlightRects = getTargetRects(
        spotlightTargetIds,
        spotlightPadding,
      ).concat(
        getVirtualSpotlightTargetRects(spotlightVirtualTargets, spotlightPadding),
      );
      const nextCardTargetRects = getTargetRects(cardTargetIds, cardTargetPadding);

      setRingRects((currentRects) =>
        areHighlightRectsEqual(currentRects, nextRingRects)
          ? currentRects
          : nextRingRects,
      );
      setSpotlightRects((currentRects) =>
        areHighlightRectsEqual(currentRects, nextSpotlightRects)
          ? currentRects
          : nextSpotlightRects,
      );
      setCardTargetRect((currentRect) => {
        const nextCardTargetRect = getBoundingRect(nextCardTargetRects);
        return areRectLikesEqual(currentRect, nextCardTargetRect)
          ? currentRect
          : nextCardTargetRect;
      });
    };

    let frameId: number | null = null;
    let needsObserverRefresh = false;
    const scheduleRectUpdate = () => {
      if (frameId != null) return;
      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        if (needsObserverRefresh) {
          observeHighlightElements();
          needsObserverRefresh = false;
        }
        updateRect();
      });
    };

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            scheduleRectUpdate();
          });
    const observeHighlightElements = () => {
      if (!resizeObserver) return;
      resizeObserver.disconnect();
      collectHighlightElements({
        cardTargetIds,
        ringTargetIds,
        ringVirtualTargets,
        spotlightTargetIds,
        spotlightVirtualTargets,
      }).forEach((element) => {
        resizeObserver.observe(element);
      });
    };

    observeHighlightElements();
    updateRect();

    const handleWindowChange = () => scheduleRectUpdate();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    const mutationObserver =
      typeof MutationObserver === "undefined" || !document.body
        ? null
        : new MutationObserver(() => {
            needsObserverRefresh = true;
            scheduleRectUpdate();
          });

    mutationObserver?.observe(document.body, {
      attributeFilter: [
        "class",
        "style",
        "hidden",
        "aria-hidden",
        "data-row",
        "data-col",
        "data-column-index",
      ],
      attributes: true,
      childList: true,
      subtree: true,
    });
    window.addEventListener("resize", handleWindowChange);
    window.addEventListener("scroll", handleWindowChange, true);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      if (frameId != null) {
        window.cancelAnimationFrame(frameId);
      }
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      window.removeEventListener("resize", handleWindowChange);
      window.removeEventListener("scroll", handleWindowChange, true);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, isRingActivated, onClose, step]);

  const spotlightBounds = useMemo(
    () => getBoundingRect(spotlightRects),
    [spotlightRects],
  );
  const progressStepIds = useMemo(() => {
    const next: string[] = [];

    for (const entry of steps) {
      const progressId = entry.progressGroupId ?? entry.id;
      if (!next.includes(progressId)) {
        next.push(progressId);
      }
    }

    return next;
  }, [steps]);

  const anchorRect = useMemo(
    () => ringRects[0] ?? spotlightBounds ?? null,
    [ringRects, spotlightBounds],
  );

  const cardStyle = useMemo(() => {
    if (!isOpen || !step || typeof window === "undefined") return undefined;
    if (cardTargetRect && step.cardAnchor) {
      return computeAnchoredCardPosition(
        cardTargetRect,
        step.cardAnchor,
        cardSize,
        step.cardOffsetX ?? 0,
        step.cardOffsetY ?? 0,
      );
    }

    return computeCardPosition(
      anchorRect,
      step.placement ?? "bottom",
      cardSize,
      step.cardOffsetX ?? 0,
      step.cardOffsetY ?? 0,
    );
  }, [anchorRect, cardSize, cardTargetRect, isOpen, step]);

  if (!isOpen || !step) return null;

  const totalSteps = steps.length;
  const isLastStep = stepIndex >= totalSteps - 1;
  const currentProgressStepId = step.progressGroupId ?? step.id;
  const resolvedProgressStepIndex = progressStepIds.indexOf(currentProgressStepId);
  const progressStepIndex =
    resolvedProgressStepIndex >= 0 ? resolvedProgressStepIndex : stepIndex;
  const totalProgressSteps = progressStepIds.length || totalSteps;
  const viewportWidth =
    typeof window === "undefined" ? 0 : Math.max(0, window.innerWidth);
  const viewportHeight =
    typeof window === "undefined" ? 0 : Math.max(0, window.innerHeight);
  const backdropOpacity = clamp(step.backdropOpacity ?? 0.58, 0, 0.9);
  const backdropFill = `rgba(0,0,0,${backdropOpacity})`;
  const backdropRects = spotlightRects.length > 0 ? spotlightRects : ringRects;
  const shouldUseFullBackdrop =
    step.backdropMode === "full" || backdropRects.length === 0;
  const interactionBlockerRects = getInteractionBlockerRects(
    viewportWidth,
    viewportHeight,
    ringRects,
  );

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[120] text-text-primary"
      aria-live="polite"
    >
      {!shouldUseFullBackdrop ? (
        <>
          <svg
            className="absolute inset-0 h-full w-full"
            aria-hidden="true"
            viewBox={`0 0 ${viewportWidth} ${viewportHeight}`}
            preserveAspectRatio="none"
          >
            <defs>
              <mask
                id={maskId}
                x="0"
                y="0"
                width={viewportWidth}
                height={viewportHeight}
                maskUnits="userSpaceOnUse"
                maskContentUnits="userSpaceOnUse"
              >
                <rect
                  x="0"
                  y="0"
                  width={viewportWidth}
                  height={viewportHeight}
                  fill="white"
                />
                {backdropRects.map((rect, index) => (
                  <rect
                    key={`${step.id}-mask-${index}`}
                    x={rect.left}
                    y={rect.top}
                    width={rect.width}
                    height={rect.height}
                    rx={rect.radius}
                    ry={rect.radius}
                    fill="black"
                  />
                ))}
              </mask>
            </defs>

            <rect
              x="0"
              y="0"
              width={viewportWidth}
              height={viewportHeight}
              fill={backdropFill}
              mask={`url(#${maskId})`}
            />
          </svg>

          {backdropRects.map((rect, index) => (
            <div
              key={`${step.id}-spotlight-${index}`}
              className="absolute border border-white/18 bg-white/[0.02] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]"
              style={{
                ...rect,
                borderRadius: `${rect.radius}px`,
              }}
            />
          ))}
        </>
      ) : (
        <div className="absolute inset-0" style={{ background: backdropFill }} />
      )}

      {interactionBlockerRects.map((rect, index) => (
        <div
          key={`${step.id}-interaction-blocker-${index}`}
          aria-hidden="true"
          className="pointer-events-auto absolute"
          style={rect}
        />
      ))}

      {ringRects.map((rect, index) => (
        <div
          key={`${step.id}-ring-${index}`}
          className="analysis-onboarding-ring absolute border-2 border-accent-terracotta"
          style={{
            ...rect,
            borderRadius: `${rect.radius}px`,
            background: "rgba(255,255,255,0.03)",
          }}
        />
      ))}

      <div
        ref={cardRef}
        className="pointer-events-auto fixed flex flex-col overflow-hidden rounded-[24px] border border-border bg-bg-surface p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)]"
        style={{
          ...cardStyle,
          height: CARD_HEIGHT,
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="analysis-onboarding-title"
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="text-xs font-medium uppercase tracking-[0.18em] text-text-secondary">
            {t("da_onboarding_progress", {
              current: progressStepIndex + 1,
              total: totalProgressSteps,
            })}
          </div>
          <button
            type="button"
            className="rounded-full px-2 py-1 text-sm text-text-secondary transition hover:bg-bg-page hover:text-text-primary"
            onClick={onClose}
          >
            {t("da_onboarding_skip")}
          </button>
        </div>

        <h3
          id="analysis-onboarding-title"
          className="text-lg font-semibold text-text-primary"
        >
          {t(step.titleKey)}
        </h3>
        <div className="mt-2 min-h-0 flex-1 overflow-y-auto pr-1">
          <p className="text-sm leading-6 text-text-secondary">{t(step.bodyKey)}</p>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onBack}
              disabled={stepIndex === 0}
            >
              {t("da_onboarding_back")}
            </Button>
          </div>

          <div className="flex items-center gap-2">
            {progressStepIds.map((progressId, index) => (
              <span
                key={progressId}
                className={`h-2 rounded-full transition-all ${
                  index === progressStepIndex
                    ? "w-6 bg-[#222222]"
                    : "w-2 bg-border"
                }`}
                aria-hidden="true"
              />
            ))}
          </div>

          <Button
            variant="primary"
            size="sm"
            onClick={onNext}
            disabled={!canNext}
          >
            {isLastStep ? t("da_onboarding_finish") : t("da_onboarding_next")}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
