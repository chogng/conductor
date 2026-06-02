export type ThumbnailCurveFilter = string;

export type ThumbnailFileForView = {
  curveFilterField?: string | null;
  curveFilterKey?: string | null;
  curveType?: string;
  fileId?: string;
  xAxisRole?: "vg" | "vd" | null;
  xLabel?: string;
};

export type ThumbnailCurveFieldFilterMeta = {
  key: string;
  label: string;
};

export const isBuiltInThumbnailCurveFilter = (
  value: unknown,
): value is "all" | "transfer" | "output" =>
  value === "all" || value === "transfer" || value === "output";

export const resolveThumbnailCurveFieldFilterMeta = (
  file: ThumbnailFileForView,
): ThumbnailCurveFieldFilterMeta | null => {
  const key = String(file?.curveFilterKey ?? "").trim();
  const label = String(file?.curveFilterField ?? "").trim();

  if (key) {
    return {
      key,
      label: label || key,
    };
  }

  if (label) {
    return {
      key: `field-label:${label.toLowerCase()}`,
      label,
    };
  }

  return null;
};

export const createThumbnailFieldFilterOptions = <T extends ThumbnailFileForView>(
  files: readonly T[],
  t: (key: string) => string,
): Array<{ label: string; value: string }> => {
  const options: Array<{ label: string; value: string }> = [];
  const seen = new Set<string>();

  for (const file of files) {
    const meta = resolveThumbnailCurveFieldFilterMeta(file);
    if (!meta || seen.has(meta.key)) continue;

    seen.add(meta.key);
    options.push({
      label: `${t("da_match_mode_field")}: ${meta.label}`,
      value: meta.key,
    });
  }

  return options;
};

export const filterThumbnailFiles = <T extends ThumbnailFileForView>(
  files: readonly T[],
  curveFilter: ThumbnailCurveFilter,
): T[] => {
  if (curveFilter === "all") return [...files];

  if (curveFilter === "transfer" || curveFilter === "output") {
    const target = curveFilter === "transfer" ? "vg" : "vd";
    return files.filter((file) => {
      const xAxisRole = String(file?.xAxisRole ?? "").toLowerCase();
      if (xAxisRole) return xAxisRole === target;

      if (file?.curveType) {
        const curveType = String(file.curveType).toLowerCase();
        return curveType.includes(target) || curveType.includes(curveFilter);
      }

      const label = String(file?.xLabel || "").toLowerCase();
      return label.includes(target);
    });
  }

  const selectedFieldKey = String(curveFilter).trim().toLowerCase();
  if (!selectedFieldKey) return [...files];

  return files.filter((file) => {
    const meta = resolveThumbnailCurveFieldFilterMeta(file);
    return Boolean(meta && meta.key.toLowerCase() === selectedFieldKey);
  });
};

export const getVisibleThumbnailFileIds = (
  files: readonly ThumbnailFileForView[],
): string[] =>
  files
    .map((file) => String(file?.fileId ?? "").trim())
    .filter(Boolean);
