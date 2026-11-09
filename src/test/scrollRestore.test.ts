import { describe, expect, it } from "vitest";
import { consumeScrollRestored, markScrollRestored } from "@/lib/scrollRestore";

describe("scroll restore mark", () => {
  it("lets the shell skip its jump to the top once, for the marked path only", () => {
    markScrollRestored("/orders");
    expect(consumeScrollRestored("/orders")).toBe(true);
    expect(consumeScrollRestored("/orders")).toBe(false);
  });

  it("clears the mark when the shell lands on another path", () => {
    markScrollRestored("/orders");
    expect(consumeScrollRestored("/products")).toBe(false);
    expect(consumeScrollRestored("/orders")).toBe(false);
  });
});
