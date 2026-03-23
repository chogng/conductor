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

export type OnboardingStep = {
  id: string;
  titleKey: string;
  bodyKey: string;
  page: OnboardingPage;
  placement?: "top" | "bottom" | "left" | "right" | "center";
  ringTargetIds?: string[];
  spotlightTargetIds?: string[];
  cardTargetIds?: string[];
  cardAnchor?: OnboardingCardAnchor;
  cardOffsetX?: number;
  cardOffsetY?: number;
  cardTargetPadding?: number;
  backdropMode?: OnboardingBackdropMode;
  backdropOpacity?: number;
  ringPadding?: number;
  spotlightPadding?: number;
  targetIds?: string[];
  highlightMode?: OnboardingHighlightMode;
};
