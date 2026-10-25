import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const source = readFileSync("server/index.js", "utf8");
const route = (marker: string) => {
  const start = source.indexOf(marker);
  expect(start).toBeGreaterThan(-1);
  return source.slice(start, source.indexOf("\napp.", start + 5));
};

it("sends checkout SMS behind auth, scoped to the workspace's active checkouts", () => {
  const body = route('app.post("/api/abandoned-checkouts/:id/send-sms"');
  for (const token of [
    "getUser(getToken(req))",
    'return res.status(401).json({ error: "Unauthorized" })',
    "isAbandonedCheckoutDraftKey(req.params.id)",
    "MAX_MANUAL_SMS_LENGTH",
    '.from("abandoned_checkouts")',
    '.eq("org_id", orgId)',
    '.in("status", ACTIVE_ABANDONED_CHECKOUT_STATUSES)',
    "normalizeBdPhone(checkout.phone)",
    "sendManualBulkSms(orgId",
    'orderTable: "abandoned_checkouts"',
  ]) expect(body).toContain(token);
});
