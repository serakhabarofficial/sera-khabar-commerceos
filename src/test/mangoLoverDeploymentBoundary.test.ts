import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Sera Khabar deployment boundary", () => {
  it("shows the canonical Sera Khabar webhook URL in integration settings", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/IntegrationSettings.tsx"),
      "utf8",
    );

    expect(source).toContain(
      "POST https://admin.serakhabar.com/api/custom-orders/webhook",
    );
    expect(source).toContain(
      "https://admin.serakhabar.com/api/webhooks/facebook",
    );
    expect(source).toContain(
      "https://admin.serakhabar.com/api/webhooks/whatsapp",
    );
    expect(source).toContain(
      "https://admin.serakhabar.com/api/auth/shopify/callback",
    );
    expect(source).not.toContain("suite.arclabtechnology.com");
    expect(source).not.toContain("https://merchant-suite.com/api/");
  });
});
