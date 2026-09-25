import { describe, expect, it } from "vitest";
import { OptimisticButtons } from "./optimistic-buttons";

describe("optimistic button feedback", () => {
  it("keeps two quick toggles correct through out-of-order MagicQ snapshots", () => {
    const buttons = new OptimisticButtons();
    buttons.predict(31, true, 0);
    expect(buttons.value(31, 0, 300)).toBe(1);
    buttons.predict(31, false, 400);
    expect(buttons.value(31, 0, 500)).toBe(0); // Old off state must not acknowledge the second click.
    expect(buttons.value(31, 1, 800)).toBe(0); // Delayed feedback from the first click.
    buttons.predict(31, true, 850);
    expect(buttons.value(31, 0, 1100)).toBe(1);
    expect(buttons.value(31, 1, 2400)).toBe(1);
  });

  it("returns to console feedback after the grace period or a source switch", () => {
    const buttons = new OptimisticButtons();
    buttons.predict(1, true, 0);
    expect(buttons.value(1, 0, 1500)).toBe(0);
    buttons.predict(1, true, 1600);
    buttons.clear();
    expect(buttons.value(1, 0, 1700)).toBe(0);
  });
});
