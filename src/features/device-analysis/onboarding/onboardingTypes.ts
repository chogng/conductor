export type OnboardingPage = "data" | "analysis" | "settings";

export type OnboardingHighlightMode = "ring" | "spotlight";
export type OnboardingCardAnchor =
  | "center"
  | "top-left"
  | "top-center"
  | "top-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export type OnboardingBackdropMode = "auto" | "full";
export type OnboardingVirtualRingTarget = {
  kind: "preview-cell";
  anchorId: string;
  rowIndex: number;
  colIndex: number;
  rowHeight?: number;
};

export type OnboardingVirtualSpotlightTarget =
  | { kind: "analysis-chart-section" }
  | { kind: "analysis-overview-section" }
  | { kind: "analysis-calculated-section" };

export type OnboardingStep = {
  id: string;
  titleKey: string;
  bodyKey: string;
  page: OnboardingPage;
  progressGroupId?: string;
  placement?: "top" | "bottom" | "left" | "right" | "center";
  ringTargetIds?: string[];
  ringVirtualTargets?: OnboardingVirtualRingTarget[];
  ringActivationTargetIds?: string[];
  activatedRingTargetIds?: string[];
  activatedRingVirtualTargets?: OnboardingVirtualRingTarget[];
  spotlightTargetIds?: string[];
  spotlightVirtualTargets?: OnboardingVirtualSpotlightTarget[];
  cardTargetIds?: string[];
  cardAnchor?: OnboardingCardAnchor;
  cardOffsetX?: number;
  cardOffsetY?: number;
  cardTargetPadding?: number;
  backdropMode?: OnboardingBackdropMode;
  backdropOpacity?: number;
  ringPadding?: number;
  spotlightPadding?: number;
  focusTargetId?: string;
  targetIds?: string[];
  highlightMode?: OnboardingHighlightMode;
};
