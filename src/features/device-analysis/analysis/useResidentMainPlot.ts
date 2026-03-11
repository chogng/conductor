import { useCallback, useEffect, useRef, useState } from "react";

type IvGmPlotType = "iv" | "gm";

const IV_GM_STANDBY_PREWARM_DELAY_MS = 240;
const IV_GM_STANDBY_RESIDENT_TTL_MS = 20000;

export const useResidentMainPlot = ({
  effectivePlotType,
}: {
  effectivePlotType: string;
}) => {
  const [residentMainPlotTypes, setResidentMainPlotTypes] = useState<IvGmPlotType[]>(
    ["iv"],
  );
  const mainPlotPrewarmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mainPlotEvictTimerRefs = useRef<
    Record<IvGmPlotType, ReturnType<typeof setTimeout> | null>
  >({
    iv: null,
    gm: null,
  });
  const effectivePlotTypeRef = useRef<string>("iv");

  useEffect(() => {
    effectivePlotTypeRef.current = effectivePlotType;
  }, [effectivePlotType]);

  const removeResidentMainPlotType = useCallback((targetType: IvGmPlotType) => {
    setResidentMainPlotTypes((prev) => {
      if (effectivePlotTypeRef.current === targetType) return prev;
      if (!prev.includes(targetType)) return prev;
      return prev.filter((item) => item !== targetType);
    });
  }, []);

  const scheduleResidentMainPlotEvict = useCallback(
    (
      targetType: IvGmPlotType,
      delayMs = IV_GM_STANDBY_RESIDENT_TTL_MS,
    ) => {
      const timers = mainPlotEvictTimerRefs.current;
      const current = timers[targetType];
      if (current) clearTimeout(current);

      timers[targetType] = setTimeout(() => {
        timers[targetType] = null;
        removeResidentMainPlotType(targetType);
      }, Math.max(0, delayMs));
    },
    [removeResidentMainPlotType],
  );

  useEffect(() => {
    if (mainPlotPrewarmTimerRef.current) {
      clearTimeout(mainPlotPrewarmTimerRef.current);
      mainPlotPrewarmTimerRef.current = null;
    }

    if (effectivePlotType !== "iv" && effectivePlotType !== "gm") {
      scheduleResidentMainPlotEvict("iv", 0);
      scheduleResidentMainPlotEvict("gm", 0);
      return;
    }

    const activeType = effectivePlotType as IvGmPlotType;
    const standbyType: IvGmPlotType = activeType === "iv" ? "gm" : "iv";

    setResidentMainPlotTypes((prev) =>
      prev.includes(activeType) ? prev : [...prev, activeType],
    );

    const activeTimer = mainPlotEvictTimerRefs.current[activeType];
    if (activeTimer) {
      clearTimeout(activeTimer);
      mainPlotEvictTimerRefs.current[activeType] = null;
    }

    scheduleResidentMainPlotEvict(standbyType);
    mainPlotPrewarmTimerRef.current = setTimeout(() => {
      if (effectivePlotTypeRef.current !== activeType) return;
      setResidentMainPlotTypes((prev) =>
        prev.includes(standbyType) ? prev : [...prev, standbyType],
      );
      scheduleResidentMainPlotEvict(standbyType);
    }, IV_GM_STANDBY_PREWARM_DELAY_MS);
  }, [effectivePlotType, scheduleResidentMainPlotEvict]);

  useEffect(() => {
    return () => {
      if (mainPlotPrewarmTimerRef.current) {
        clearTimeout(mainPlotPrewarmTimerRef.current);
        mainPlotPrewarmTimerRef.current = null;
      }

      const timers = mainPlotEvictTimerRefs.current;
      for (const key of Object.keys(timers) as IvGmPlotType[]) {
        const timer = timers[key];
        if (timer) clearTimeout(timer);
        timers[key] = null;
      }
    };
  }, []);

  return {
    residentMainPlotTypes,
  };
};
