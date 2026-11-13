import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const server = read("server/index.js");

function handler(signature: string): string {
  const start = server.indexOf(signature);
  expect(start).toBeGreaterThanOrEqual(0);
  const rest = server.slice(start);
  return rest.slice(0, rest.indexOf("\n});"));
}

describe("team member report access", () => {
  it("adds an admin-controlled can_view_reports flag on user_roles", () => {
    const migration = read("supabase/migrations/20261113114455_team_member_report_access.sql");
    expect(migration).toContain("add column if not exists can_view_reports boolean not null default false");
  });

  it("lets admins or members with the flag open the business report, within the workspace", () => {
    const route = handler('app.get("/api/reports/business"');
    expect(route).toContain("await canViewReports(supabase, orgId, user.id, role)");
    expect(route).not.toContain('role !== "admin"');
    const helper = server.slice(server.indexOf("async function canViewReports"));
    expect(helper.slice(0, helper.indexOf("\n}"))).toContain('.eq("org_id", orgId)');
  });

  it("reports the access in /api/me, always true for admins", () => {
    expect(server).toContain('canViewReports: role === "admin" || roleRow?.can_view_reports === true');
  });

  it("gates the business report route, sidebar and staff totals on canViewReports", () => {
    expect(read("src/App.tsx")).toContain("<ReportsRoute><BusinessReport /></ReportsRoute>");
    expect(read("src/components/AppSidebar.tsx")).toContain("disabled: !canViewReports");
    const staff = read("src/pages/StaffPerformance.tsx");
    expect(staff).toContain("!canViewReports && \"blur-[8px]");
    expect(staff).not.toMatch(/\bisAdmin\b/);
  });
});
