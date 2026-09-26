import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocketService } from "./server";
import { defaultSPLSettings } from "../lib/spl-settings";

describe("DJ preset editing", () => {
  it("acknowledges SPL saves only after persistence succeeds", async () => {
    const directory = mkdtempSync(join(tmpdir(), "spl-save-"));
    try {
      const runtime = Object.create(WebSocketService.prototype);
      runtime.splSettingsPath = join(directory, "settings.json");
      runtime.publishDJMessageSettings = () => {};
      runtime.refreshSPLState = () => {};
      runtime.broadcast = () => {};
      const replies: Array<{ type: string }> = [];
      const ws = { send: (value: string) => replies.push(JSON.parse(value)) };
      const command = JSON.stringify({ type: "set-spl-settings", data: defaultSPLSettings });
      await runtime.handleWebSocketMessage(ws, command);
      expect(replies).toEqual([{ type: "spl-settings-saved" }]);
      runtime.splSettingsPath = join(directory, "missing", "settings.json");
      replies.length = 0;
      await runtime.handleWebSocketMessage(ws, command);
      expect(replies.map(item => item.type)).toEqual(["spl-settings-error"]);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it("saves one DJ slot, preserves SPL thresholds, and publishes retained DJ labels", async () => {
    const directory = mkdtempSync(join(tmpdir(), "dj-preset-"));
    try {
      const runtime = Object.create(WebSocketService.prototype);
      runtime.splSettings = structuredClone(defaultSPLSettings);
      runtime.splSettingsPath = join(directory, "settings.json");
      runtime.piMessages = { presets: ["Technician message"], history: [] };
      const publications: unknown[] = [];
      runtime.mqttBroker = { publishText: (...args: unknown[]) => publications.push(args) };
      runtime.broadcast = () => {};
      const replies: unknown[] = [];
      await runtime.handleWebSocketMessage({ send: (value: string) => replies.push(JSON.parse(value)) }, JSON.stringify({ type: "set-dj-preset", data: { index: 5, text: "Please call the technician" } }));
      const saved = JSON.parse(readFileSync(runtime.splSettingsPath, "utf8"));
      expect(saved.messages[5]).toBe("Please call the technician");
      expect(saved.average).toEqual(defaultSPLSettings.average);
      expect(runtime.piMessages.presets).toEqual(["Technician message"]);
      expect(publications).toContainEqual(["tosklight/dj/preset/6", "Please call the technician", true]);
      expect(replies).toEqual([{ type: "dj-preset-saved", data: { index: 5 } }]);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
