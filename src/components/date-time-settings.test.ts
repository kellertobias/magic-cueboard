import { describe, expect, it } from "vitest";
import { adjustDateTime } from "./date-time-settings";

describe("inline date and time controls", () => {
  it("clamps the day when changing month or leaving a leap year", () => {
    expect(adjustDateTime("2026-01-31T12:30:00", 1, 1)).toBe("2026-02-28T12:30:00");
    expect(adjustDateTime("2024-02-29T12:30:00", 0, 1)).toBe("2025-02-28T12:30:00");
  });
  it("wraps time fields and bounds years to the server's supported range", () => {
    expect(adjustDateTime("2026-09-27T23:59:00", 3, 1)).toBe("2026-09-27T00:59:00");
    expect(adjustDateTime("2026-09-27T12:00:00", 4, -1)).toBe("2026-09-27T12:59:00");
    expect(adjustDateTime("2020-01-01T00:00:00", 0, -1)).toBe("2020-01-01T00:00:00");
  });
});
