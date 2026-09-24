import { describe, expect, it } from "vitest";
import { dotColorFromName } from "./dot-color";

describe("dotColorFromName", () => {
  it("maps configured color words", () => {
    expect(dotColorFromName("Front Red")).toBe("ff0000");
    expect(dotColorFromName("Wash CTO 2")).toBe("ffb45b");
    expect(dotColorFromName("Cyan FX")).toBe("00ffff");
  });
  it("does not match fragments of unrelated words", () => {
    expect(dotColorFromName("Credit Roll")).toBeNull();
  });
});
