import { describe, expect, it } from "vitest";
import { systemMetricsAreFresh } from "./system-metrics";

describe("system metric freshness", () => {
  it("uses local elapsed time without depending on the Windows wall clock", () => {
    expect(systemMetricsAreFresh(500, 1500)).toBe(true);
    expect(systemMetricsAreFresh(500, 10500)).toBe(false);
  });
  it("does not revive a stale cached snapshot on a new browser connection", () => {
    expect(systemMetricsAreFresh(500, 500, 15000)).toBe(false);
    expect(systemMetricsAreFresh(null, 500)).toBe(false);
  });
});
