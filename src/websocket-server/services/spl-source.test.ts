import { describe, expect, it } from "vitest";
import { decodeSPLMeasurement, splPublications } from "./spl-source";

describe("external SPL API", () => {
  it("accepts native and Home Assistant shaped readings", () => {
    expect(decodeSPLMeasurement({ measured: 92.4, freqMode: "dBC" }).measured).toBe(92.4);
    expect(decodeSPLMeasurement({ state: "81.5", attributes: { unit_of_measurement: "dBA" } })).toMatchObject({ measured: 81.5, freqMode: "dBA" });
  });
  it("rejects unsafe or non-audio values", () => {
    expect(() => decodeSPLMeasurement({ value: "offline" })).toThrow(/invalid measurement/);
    expect(() => decodeSPLMeasurement(250)).toThrow(/invalid measurement/);
  });
});

describe("SPL MQTT publications", () => {
  it("keeps legacy topics and publishes a retained ToskLight contract", () => {
    const measurement = decodeSPLMeasurement({ measured: 92.4, timestamp: "2026-09-21T10:00:00Z", freqMode: "dBA" });
    const messages = splPublications(measurement);
    expect(messages.find(item => item.topic === "spl/value")?.value).toBe(92.4);
    expect(messages.find(item => item.topic === "tosklight/spl")?.value).toEqual(measurement);
    expect(messages.find(item => item.topic === "tosklight/spl/availability")).toMatchObject({ value: "online", retain: true });
    expect(messages.every(item => item.retain)).toBe(true);
  });
});
