import type { BusinessReportSource } from "@/components/business-report/types";

export function rate(numerator: number, denominator: number): number {
  return denominator > 0 ? (numerator / denominator) * 100 : 0;
}

export function percentChange(current: number, previous: number): number | null {
  return previous > 0 ? ((current - previous) / previous) * 100 : null;
}

export function pointChange(currentRate: number, previousRate: number): number {
  return currentRate - previousRate;
}

export type MixSlice = { label: string; value: number };

export function groupSourceMix(sources: BusinessReportSource[], maxSlices = 4): MixSlice[] {
  const sorted = [...sources]
    .filter((source) => source.order_value > 0)
    .sort((a, b) => b.order_value - a.order_value);
  const top = sorted.slice(0, maxSlices).map((source) => ({ label: source.label, value: source.order_value }));
  const rest = sorted.slice(maxSlices).reduce((sum, source) => sum + source.order_value, 0);
  return rest > 0 ? [...top, { label: "Other", value: rest }] : top;
}

export function maxIndex(values: number[]): number {
  let best = -1;
  let bestValue = 0;
  values.forEach((value, index) => {
    if (value > bestValue) {
      best = index;
      bestValue = value;
    }
  });
  return best;
}
