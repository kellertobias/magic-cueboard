import { describe, expect, it } from "vitest";
import { defaultSPLSettings, validateSPLSettings } from "../../lib/spl-settings";
import { SPLStateCalculator } from "./spl-state";

describe("SPL state", () => {
  it("uses the highest priority color from average and peak", () => {
    const calculator = new SPLStateCalculator();
    const settings = { ...defaultSPLSettings, averageSeconds: 10, peakSeconds: 1, redBlinkSeconds: 5 };
    expect(calculator.update(65, "dBA", settings, 0).color).toBe("blue");
    expect(calculator.update(75, "dBA", settings, 500).color).toBe("green");
    expect(calculator.update(85, "dBA", settings, 1000).color).toBe("yellow");
    expect(calculator.update(95, "dBA", settings, 1500).color).toBe("red");
    expect(calculator.calculate(settings, 6500)?.color).toBe("red-blink");
    expect(calculator.update(60, "dBA", settings, 7000).color).toBe("green");
  });
  it("validates ordered independent thresholds and message presets", () => {
    expect(validateSPLSettings(defaultSPLSettings).messages).toEqual(["Audio problem", "Light problem", "Yes", "No", "", ""]);
    expect(() => validateSPLSettings({ ...defaultSPLSettings, peak: { green: 90, yellow: 80, red: 100 } })).toThrow(/thresholds/);
    expect(() => validateSPLSettings({ ...defaultSPLSettings, messageTopic: "bad/#" })).toThrow(/topic/);
  });
});
