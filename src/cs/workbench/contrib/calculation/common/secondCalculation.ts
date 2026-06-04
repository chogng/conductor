import {
  calculateGmPoints,
  type CalculationPoint,
} from "./firstCalculation.ts";

export type SecondCalculationKind = "secondDerivative";

export type SecondCalculationSourceKind = "gm" | "ss" | "vth" | "iv";

export type SecondCalculationSource = {
  readonly fileId: string | null;
  readonly inputKind: SecondCalculationSourceKind;
};

export type SecondCalculationResult = {
  readonly kind: SecondCalculationKind;
  readonly source: SecondCalculationSource;
  readonly points: CalculationPoint[];
};

// 二次计算区域：输入是一次计算结果点，不直接消费清洗数据。
export const calculateSecondDerivativePoints = (
  points: readonly CalculationPoint[],
): CalculationPoint[] => calculateGmPoints(points);

export const createSecondDerivativeResult = ({
  fileId,
  inputKind,
  points,
}: {
  readonly fileId?: string | null;
  readonly inputKind: SecondCalculationSourceKind;
  readonly points: readonly CalculationPoint[];
}): SecondCalculationResult => ({
  kind: "secondDerivative",
  points: calculateSecondDerivativePoints(points),
  source: {
    fileId: fileId ?? null,
    inputKind,
  },
});
