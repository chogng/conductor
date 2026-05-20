import { memo, useEffect, useMemo, useRef, useState } from "react";
import { formatNumber } from "src/cs/workbench/contrib/chartPreview/lib/analysisMath";

type AnimatedNumberTextProps = {
  digits?: number;
  fallback?: string;
  value: number | null | undefined;
};

const ANIMATION_DURATION_MS = 260;
const MIN_ANIMATION_DELTA = 1e-15;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const prefersReducedMotion = (): boolean => {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
};

const easeOutCubic = (progress: number) => 1 - Math.pow(1 - progress, 3);

const AnimatedNumberText = memo(function AnimatedNumberText({
  digits,
  fallback = "-",
  value,
}: AnimatedNumberTextProps) {
  const [displayValue, setDisplayValue] = useState<number | null>(
    isFiniteNumber(value) ? value : null,
  );
  const frameRef = useRef<number | null>(null);
  const currentValueRef = useRef<number | null>(isFiniteNumber(value) ? value : null);

  useEffect(() => {
    return () => {
      if (frameRef.current !== null && typeof window !== "undefined") {
        window.cancelAnimationFrame(frameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isFiniteNumber(value)) {
      currentValueRef.current = null;
      setDisplayValue(null);
      if (frameRef.current !== null && typeof window !== "undefined") {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      return;
    }

    const previous = currentValueRef.current;
    currentValueRef.current = value;

    if (
      !isFiniteNumber(previous) ||
      prefersReducedMotion() ||
      Math.abs(value - previous) < MIN_ANIMATION_DELTA ||
      typeof window === "undefined"
    ) {
      setDisplayValue(value);
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      return;
    }

    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
    }

    const start = previous;
    const delta = value - start;
    const startTime = window.performance.now();

    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / ANIMATION_DURATION_MS);
      const eased = easeOutCubic(progress);
      setDisplayValue(start + delta * eased);
      if (progress >= 1) {
        frameRef.current = null;
        setDisplayValue(value);
        return;
      }
      frameRef.current = window.requestAnimationFrame(step);
    };

    frameRef.current = window.requestAnimationFrame(step);
  }, [value]);

  const formattedValue = useMemo(() => {
    if (!isFiniteNumber(displayValue)) return fallback;
    return formatNumber(displayValue, digits != null ? { digits } : undefined);
  }, [digits, displayValue, fallback]);

  return (
    <span className="inline-block tabular-nums leading-none">
      {formattedValue}
    </span>
  );
});

AnimatedNumberText.displayName = "AnimatedNumberText";

export default AnimatedNumberText;
