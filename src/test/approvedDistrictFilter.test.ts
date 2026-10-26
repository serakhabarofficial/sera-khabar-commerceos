import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("district alias API", () => {
  it("has no AI district routes: detection is built-in only", () => {
    const server = readFileSync(resolve(process.cwd(), "server/index.js"), "utf8");

    expect(server).not.toContain('app.get("/api/orders/district-aliases"');
    expect(server).not.toContain('app.post("/api/orders/resolve-districts"');
    expect(server).not.toContain("district_aliases");
    expect(server).not.toContain("DISTRICT_MODEL");
  });
});

describe("approved district filter wiring", () => {
  it("has no district dropdown: searching a district filters the Confirmed tab instead", () => {
    const dashboardSource = readFileSync(resolve(process.cwd(), "src/pages/Dashboard.tsx"), "utf8");

    expect(dashboardSource).not.toContain('data-testid="select-district-filter"');
    expect(dashboardSource).not.toContain("setDistrictFilter");
    expect(dashboardSource).not.toContain("/api/orders/district-aliases");
    expect(dashboardSource).not.toContain("/api/orders/resolve-districts");
  });
});
