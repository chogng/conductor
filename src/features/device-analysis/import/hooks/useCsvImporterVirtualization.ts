import {
  startTransition,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";

type UseCsvImporterVirtualizationOptions<T> = {
  containerRef: RefObject<HTMLDivElement | null>;
  files: T[];
  minCount?: number;
  gap?: number;
  rowHeight?: number;
  paddingY?: number;
  overscanRows?: number;
};

type CsvImporterVirtualizationResult<T> = {
  enabled: boolean;
  gridStyle:
    | {
        transform: string;
        willChange: "transform";
        gridTemplateColumns: string;
        gridAutoRows: string;
      }
    | undefined;
  stageStyle:
    | {
        height: string;
      }
    | undefined;
  baseIndex: number;
  visibleFiles: T[];
};

const DEFAULT_MIN_COUNT = 200;
const DEFAULT_GAP = 12;
const DEFAULT_ROW_HEIGHT = 56;
const DEFAULT_PADDING_Y = 12;
const DEFAULT_OVERSCAN_ROWS = 6;

export const useCsvImporterVirtualization = <T>({
  containerRef,
  files,
  minCount = DEFAULT_MIN_COUNT,
  gap = DEFAULT_GAP,
  rowHeight = DEFAULT_ROW_HEIGHT,
  paddingY = DEFAULT_PADDING_Y,
  overscanRows = DEFAULT_OVERSCAN_ROWS,
}: UseCsvImporterVirtualizationOptions<T>): CsvImporterVirtualizationResult<T> => {
  const [scrollRowIndex, setScrollRowIndex] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const scrollRafRef = useRef(0);

  useEffect(() => {
    return () => {
      if (scrollRafRef.current) {
        cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = 0;
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const el = containerRef.current;
    if (!el) return;

    const measure = () => {
      const target = containerRef.current;
      if (!target) return;
      setViewportHeight(target.clientHeight);
    };

    measure();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }

    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleScroll = () => {
      if (scrollRafRef.current) return;
      scrollRafRef.current = requestAnimationFrame(() => {
        scrollRafRef.current = 0;
        const target = containerRef.current;
        const scrollTop = target ? target.scrollTop : 0;
        const rowStep = rowHeight + gap;
        const nextRowIndex = Math.max(
          0,
          Math.floor((scrollTop - paddingY) / rowStep),
        );
        if (!Number.isFinite(nextRowIndex)) return;

        startTransition(() => {
          setScrollRowIndex((prev) =>
            prev === nextRowIndex ? prev : nextRowIndex,
          );
        });
      });
    };

    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [containerRef, gap, paddingY, rowHeight]);

  return useMemo(() => {
    const shouldVirtualize = files.length >= minCount;
    if (!shouldVirtualize) {
      return {
        enabled: false,
        gridStyle: undefined,
        stageStyle: undefined,
        baseIndex: 0,
        visibleFiles: files,
      };
    }

    const cols = 1;
    const rowCount = files.length;
    const rowStep = rowHeight + gap;
    const scrollY = scrollRowIndex * rowStep;
    const startRow = Math.max(0, Math.floor(scrollY / rowStep) - overscanRows);
    const endRow = Math.min(
      rowCount,
      Math.ceil((scrollY + viewportHeight) / rowStep) + overscanRows,
    );
    const startIndex = Math.max(0, startRow * cols);
    const endIndex = Math.min(files.length, endRow * cols);

    return {
      enabled: true,
      stageStyle: {
        height: `${rowCount * rowStep}px`,
      },
      gridStyle: {
        transform: `translateY(${startRow * rowStep}px)`,
        willChange: "transform" as const,
        gridTemplateColumns: "1fr",
        gridAutoRows: `${rowHeight}px`,
      },
      baseIndex: startIndex,
      visibleFiles: files.slice(startIndex, endIndex),
    };
  }, [
    files,
    gap,
    minCount,
    overscanRows,
    rowHeight,
    scrollRowIndex,
    viewportHeight,
  ]);
};
