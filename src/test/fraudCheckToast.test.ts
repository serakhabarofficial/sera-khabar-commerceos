import { describe, expect, it } from "vitest";
import { fraudCheckToast } from "@/lib/fraudCheckToast";

const fd = (total_parcels: number, total_delivered: number) => ({ total_parcels, total_delivered });

describe("fraudCheckToast", () => {
  it("reports a good delivery rate as success", () => {
    expect(fraudCheckToast("#SK-1942", fd(20, 17))).toEqual({ type: "success", title: "SK-1942 · 85% delivered" });
  });

  it("warns when the delivery rate is poor", () => {
    expect(fraudCheckToast("SK-1940", fd(10, 3))).toEqual({ type: "warning", title: "SK-1940 · 30% delivered · high risk" });
  });

  it("flags caution rates as a warning too", () => {
    expect(fraudCheckToast("SK-1939", fd(20, 11)).type).toBe("warning");
  });

  it("calls a phone with no parcel history a new customer", () => {
    expect(fraudCheckToast("SK-1938", fd(0, 0))).toEqual({ type: "info", title: "SK-1938 · New customer, no past parcels" });
  });
});
