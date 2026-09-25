import { describe, expect, it } from "vitest";
import { WebSocketService } from "./server";
import { OptimisticButtons } from "./services/optimistic-buttons";

function physicalRuntime(source: "windows" | "tosklight", type: "flash" | "toggle" | "solo") {
  const calls: Array<[string, number, number, string]> = [];
  const broadcasts: Array<{ type: string; data: { number: number; value: number } }> = [];
  const runtime = Object.create(WebSocketService.prototype) as Record<string, unknown>;
  runtime.magicqSource = source;
  runtime.state = { 1: { type, value: 0 }, 41: { type: "fader", value: 0 } };
  runtime.heldPhysicalButtons = new Map();
  runtime.ignoredPhysicalReleases = new Set();
  runtime.optimisticButtons = new OptimisticButtons();
  runtime.buttonController = { setButtonActive() {} };
  runtime.broadcastHardwareConnection = () => {};
  runtime.broadcast = (message: { type: string; data: { number: number; value: number } }) => { if (message.type === "val") broadcasts.push(message); };
  runtime.syncLocalButtonHardware = () => {};
  runtime.sendShowSetup = async () => {};
  runtime.windowsMagicq = { sendExecutor(number: number, value: number, phase: string) { calls.push(["bridge", number, value, phase]); return true; } };
  runtime.toskLightApi = { async sendExecutor(number: number, value: number, phase: string) { calls.push(["tosklight", number, value, phase]); return true; } };
  const call = (number: number, value: number, phase: "press" | "release" | "level") =>
    (runtime as unknown as { handlePhysicalExecutor: (number: number, value: number, phase: "press" | "release" | "level") => void }).handlePhysicalExecutor(number, value, phase);
  const releaseHeld = () => (runtime as unknown as { releaseHeldPhysicalButtons: () => void }).releaseHeldPhysicalButtons();
  const snapshot = async (value: number) => (runtime as unknown as { handleWindowsSnapshot: (snapshot: unknown) => Promise<void> }).handleWindowsSnapshot({
    type: "surface-snapshot", schemaVersion: 2, source: "magicq", connected: true, page: 1, layoutMode: "legacy", showName: null,
    executors: { 1: { number: 1, name: "Test", type, color: null, dotColor: null, value, active: value > 0, mode: type === "flash" ? "FL" : "CS" } },
  });
  const state = () => (runtime.state as Record<number, { value: number }>)[1]?.value;
  return { calls, broadcasts, call, releaseHeld, snapshot, state, runtime };
}

describe("Pi Cueboard action routing", () => {
  it("forwards Flash edges and fader values to Windows MagicQ", () => {
    const { calls, call } = physicalRuntime("windows", "flash");
    call(1, 1, "press");
    call(1, 0, "release");
    call(41, 0.5, "level");
    expect(calls).toEqual([["bridge", 1, 1, "press"], ["bridge", 1, 0, "release"], ["bridge", 41, 0.5, "level"]]);
  });

  it("forwards ordinary clicks and fader values to Windows ToskLight", () => {
    const { calls, call } = physicalRuntime("tosklight", "toggle");
    call(1, 1, "press");
    call(1, 0, "release");
    call(41, 0.75, "level");
    expect(calls).toEqual([["bridge", 1, 1, "click"], ["bridge", 41, 0.75, "level"]]);
  });

  it("keeps Flash momentary through the Windows bridge in ToskLight mode", () => {
    const { calls, call } = physicalRuntime("tosklight", "flash");
    call(1, 1, "press");
    call(1, 0, "release");
    expect(calls).toEqual([["bridge", 1, 1, "press"], ["bridge", 1, 0, "release"]]);
  });

  it("releases a held Flash if the Pi board disconnects", () => {
    const { calls, call, releaseHeld } = physicalRuntime("windows", "flash");
    call(1, 1, "press");
    releaseHeld();
    call(1, 0, "release");
    expect(calls).toEqual([["bridge", 1, 1, "press"], ["bridge", 1, 0, "release"]]);
  });

  it("keeps quick repeated toggle previews through delayed MagicQ feedback", async () => {
    const { calls, broadcasts, call, snapshot, state } = physicalRuntime("windows", "toggle");
    call(1, 1, "press"); call(1, 0, "release");
    expect(state()).toBe(1);
    await snapshot(0);
    expect(state()).toBe(1);
    call(1, 1, "press"); call(1, 0, "release");
    expect(state()).toBe(0);
    await snapshot(1);
    expect(state()).toBe(0);
    call(1, 1, "press"); call(1, 0, "release");
    expect(state()).toBe(1);
    expect(calls.map((entry) => entry[3])).toEqual(["click", "click", "click"]);
    expect(broadcasts.filter((message) => message.data.number === 1).map((message) => message.data.value)).toEqual([1, 1, 0, 0, 1]);
  });

  it("keeps held Flash feedback tied to the physical button", async () => {
    const { call, snapshot, state } = physicalRuntime("windows", "flash");
    call(1, 1, "press");
    await snapshot(0);
    expect(state()).toBe(1);
    call(1, 0, "release");
    await snapshot(1);
    expect(state()).toBe(0);
  });

  it("previews only Solo peers in the same region through two quick presses and stale feedback", async () => {
    const { calls, call, runtime } = physicalRuntime("windows", "solo");
    runtime.state = {
      1: { type: "solo", value: 1, region: 7 },
      2: { type: "solo", value: 0, region: 7 },
      3: { type: "solo", value: 1, region: 8 },
      4: { type: "toggle", value: 1, region: 7 },
      11: { type: "solo", value: 1, region: 7 },
    };
    const values = () => Object.fromEntries(Object.entries(runtime.state as Record<string, { value: number }>).map(([key, value]) => [key, value.value]));
    call(2, 1, "press"); call(2, 0, "release");
    expect(values()).toEqual({ 1: 0, 2: 1, 3: 1, 4: 1, 11: 0 });
    // The console reports its older state after the first local decision.
    for (const [number, value] of [[1, 1], [2, 0]] as const) {
      const pending = runtime.optimisticButtons as OptimisticButtons;
      expect(pending.value(number, value)).toBe(number === 2 ? 1 : 0);
    }
    call(1, 1, "press"); call(1, 0, "release");
    expect(values()).toEqual({ 1: 1, 2: 0, 3: 1, 4: 1, 11: 0 });
    expect(calls.map((entry) => [entry[1], entry[3]])).toEqual([[2, "click"], [1, "click"]]);
  });

  it("keeps separate adjacent Solo runs apart when no region is set", () => {
    const { call, runtime } = physicalRuntime("windows", "solo");
    runtime.state = {
      1: { type: "solo", value: 1, region: 0 },
      2: { type: "solo", value: 0, region: 0 },
      3: { type: "toggle", value: 0, region: 0 },
      4: { type: "solo", value: 1, region: 0 },
      5: { type: "solo", value: 0, region: 0 },
    };
    call(2, 1, "press"); call(2, 0, "release");
    const values = runtime.state as Record<number, { value: number }>;
    expect([values[1].value, values[2].value, values[4].value, values[5].value]).toEqual([0, 1, 1, 0]);
  });
});
