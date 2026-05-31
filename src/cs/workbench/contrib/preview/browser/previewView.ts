export type PreviewCurveFilter = string;

export type PreviewFileForView = {
  curveFilterField?: string | null;
  curveFilterKey?: string | null;
  curveType?: string;
  fileId?: string;
  xAxisRole?: "vg" | "vd" | null;
  xLabel?: string;
};

export type PreviewCurveFieldFilterMeta = {
  key: string;
  label: string;
};

export const isBuiltInPreviewCurveFilter = (
  value: unknown,
): value is "all" | "transfer" | "output" =>
  value === "all" || value === "transfer" || value === "output";

export const resolvePreviewCurveFieldFilterMeta = (
  file: PreviewFileForView,
): PreviewCurveFieldFilterMeta | null => {
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

export const createPreviewFieldFilterOptions = <T extends PreviewFileForView>(
  files: readonly T[],
  t: (key: string) => string,
): Array<{ label: string; value: string }> => {
  const options: Array<{ label: string; value: string }> = [];
  const seen = new Set<string>();

  for (const file of files) {
    const meta = resolvePreviewCurveFieldFilterMeta(file);
    if (!meta || seen.has(meta.key)) continue;

    seen.add(meta.key);
    options.push({
      label: `${t("da_match_mode_field")}: ${meta.label}`,
      value: meta.key,
    });
  }

  return options;
};

export const filterPreviewFiles = <T extends PreviewFileForView>(
  files: readonly T[],
  curveFilter: PreviewCurveFilter,
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
    const meta = resolvePreviewCurveFieldFilterMeta(file);
    return Boolean(meta && meta.key.toLowerCase() === selectedFieldKey);
  });
};

export const getVisiblePreviewFileIds = (
  files: readonly PreviewFileForView[],
): string[] =>
  files
    .map((file) => String(file?.fileId ?? "").trim())
    .filter(Boolean);
