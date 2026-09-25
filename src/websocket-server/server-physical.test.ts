import { describe, expect, it } from "vitest";
import { WebSocketService } from "./server";

function physicalRuntime(source: "windows" | "tosklight", type: "flash" | "toggle") {
  const calls: Array<[string, number, number, string]> = [];
  const runtime = Object.create(WebSocketService.prototype) as Record<string, unknown>;
  runtime.magicqSource = source;
  runtime.state = { 1: { type, value: 0 }, 41: { type: "fader", value: 0 } };
  runtime.heldPhysicalButtons = new Map();
  runtime.ignoredPhysicalReleases = new Set();
  runtime.buttonController = { setButtonActive() {} };
  runtime.windowsMagicq = { sendExecutor(number: number, value: number, phase: string) { calls.push(["bridge", number, value, phase]); return true; } };
  runtime.toskLightApi = { async sendExecutor(number: number, value: number, phase: string) { calls.push(["tosklight", number, value, phase]); return true; } };
  const call = (number: number, value: number, phase: "press" | "release" | "level") =>
    (runtime as unknown as { handlePhysicalExecutor: (number: number, value: number, phase: "press" | "release" | "level") => void }).handlePhysicalExecutor(number, value, phase);
  const releaseHeld = () => (runtime as unknown as { releaseHeldPhysicalButtons: () => void }).releaseHeldPhysicalButtons();
  return { calls, call, releaseHeld };
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
});
