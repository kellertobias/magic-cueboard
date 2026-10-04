import { describe, expect, it, vi } from "vitest";
import { WebSocketService } from "./server";

describe("Windows telemetry relay", () => {
  it("relays readings despite different Windows and Pi clocks, without refreshing repeated cached readings", () => {
    const runtime = Object.create(WebSocketService.prototype);
    runtime.windowsSystem = null;
    const packets: Array<{ data: { ageMilliseconds: number } }> = [];
    runtime.broadcast = (message: { data: { ageMilliseconds: number } }) => packets.push(message);
    const metrics = { timestamp: 1, cpuP95Percent: 25, ramUsedBytes: 100, ramTotalBytes: 200, gpuPercent: 3, temperatureC: null, cpuHistory: [25] };
    runtime.updateWindowsSystem(metrics);
    expect(packets[0].data.ageMilliseconds).toBeLessThan(100);
    runtime.windowsSystemReceivedAt = performance.now() - 20000;
    runtime.updateWindowsSystem(metrics);
    expect(packets[1].data.ageMilliseconds).toBeGreaterThanOrEqual(20000);
    runtime.updateWindowsSystem({ ...metrics, timestamp: 2 });
    expect(packets[2].data.ageMilliseconds).toBeLessThan(100);
  });
});

describe("software update completion", () => {
  it("notifies browsers to reload only after a successful update command", async () => {
    const runtime = Object.create(WebSocketService.prototype);
    runtime.commandExecutor = { callCommand: vi.fn().mockResolvedValue(true) };
    runtime.broadcast = vi.fn();
    const ws = { send: vi.fn() };
    await runtime.handleSystemCommand(ws, { command: "update-software" });
    expect(runtime.broadcast).toHaveBeenCalledWith({ type: "system-command-complete", data: { command: "update-software", succeeded: true } });

    runtime.commandExecutor.callCommand.mockResolvedValue(false);
    runtime.broadcast.mockClear();
    await runtime.handleSystemCommand(ws, { command: "update-software" });
    expect(runtime.broadcast).toHaveBeenCalledWith({ type: "system-command-complete", data: { command: "update-software", succeeded: false } });
  });
});
