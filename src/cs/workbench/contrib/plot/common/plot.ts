// Defines shared plot type identifiers and guards used across plot feature boundaries.
export const PlotTypes = ["iv", "ss", "gm", "vth"] as const;

export type PlotType = typeof PlotTypes[number];

export const isPlotType = (value: unknown): value is PlotType =>
  typeof value === "string" && (PlotTypes as readonly string[]).includes(value);
