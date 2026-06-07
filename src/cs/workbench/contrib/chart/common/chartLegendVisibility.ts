import {
  createCalculatedDataSignature,
  type CalculatedData,
} from "src/cs/workbench/contrib/calculation/common/calculatedData";

export const filterCalculatedDataSeries = (
  model: CalculatedData,
  hiddenLegendKeys: readonly string[],
): CalculatedData => {
  if (!hiddenLegendKeys.length) {
    return model;
  }

  const hidden = new Set(hiddenLegendKeys);
  const seriesList = model.seriesList.filter((series) => !hidden.has(series.id));
  if (seriesList.length === model.seriesList.length) {
    return model;
  }

  const points = seriesList.flatMap((series) => series.data);
  const xDomain = getFiniteDomain(points.map((point) => Number(point.x)), model.xDomain);
  const yDomain = getFiniteDomain(points.map((point) => Number(point.y)), model.yDomain);
  const nextModel = {
    activeFile: model.activeFile,
    kind: model.kind,
    pointsCount: points.length,
    seriesList,
    source: model.source,
    xDomain,
    xUnitLabel: model.xUnitLabel,
    yDomain,
    yUnitLabel: model.yUnitLabel,
  };
  return {
    ...nextModel,
    signature: createCalculatedDataSignature(nextModel),
  };
};

const getFiniteDomain = (
  values: readonly number[],
  fallback: [number, number],
): [number, number] => {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) {
    return fallback;
  }

  const min = Math.min(...finite);
  const max = Math.max(...finite);
  return min === max ? [min - 0.5, max + 0.5] : [min, max];
};
