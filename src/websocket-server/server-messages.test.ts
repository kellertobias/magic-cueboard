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

describe("Cueboard outgoing preset banks", () => {
  it("persists each destination independently without changing DJ-owned messages", async () => {
    const directory = mkdtempSync(join(tmpdir(), "pi-preset-banks-"));
    try {
      const runtime = Object.create(WebSocketService.prototype);
      runtime.piMessagesPath = join(directory, "pi.json");
      runtime.piMessages = { presets: ["Old Pi message", "", "", "", "", ""], history: [] };
      runtime.splSettings = structuredClone(defaultSPLSettings);
      runtime.broadcast = () => {};
      const replies: any[] = [];
      const ws = { send: (text: string) => replies.push(JSON.parse(text)) };
      for (const recipient of ["dj", "group"]) await runtime.handleWebSocketMessage(ws, JSON.stringify({ type: "set-pi-preset", data: { recipient, index: 0, text: `To ${recipient}` } }));
      const saved = JSON.parse(readFileSync(runtime.piMessagesPath, "utf8"));
      expect(saved.outgoingPresets.dj[0]).toBe("To dj");
      expect(saved.outgoingPresets.group[0]).toBe("To group");
      expect(runtime.splSettings).toEqual(defaultSPLSettings);
      expect(replies.map(item => item.type)).toEqual(["pi-preset-saved", "pi-preset-saved"]);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it("persists group-phone replies separately and broadcasts them to mobile remotes", async () => {
    const directory = mkdtempSync(join(tmpdir(), "group-reply-presets-"));
    try {
      const runtime = Object.create(WebSocketService.prototype);
      runtime.piMessagesPath = join(directory, "pi.json");
      runtime.piMessages = { presets: [], history: [] };
      const broadcasts: unknown[] = [];
      runtime.broadcast = (message: unknown) => broadcasts.push(message);
      const replies: any[] = [];
      await runtime.handleWebSocketMessage({ send: (text: string) => replies.push(JSON.parse(text)) }, JSON.stringify({ type: "set-group-reply-preset", data: { index: 0, text: "On my way" } }));
      const saved = JSON.parse(readFileSync(runtime.piMessagesPath, "utf8"));
      expect(saved.groupReplyPresets[0]).toBe("On my way");
      expect(broadcasts).toContainEqual(expect.objectContaining({ type: "pi-messages-state", data: expect.objectContaining({ groupReplyPresets: expect.arrayContaining(["On my way"]) }) }));
      expect(replies).toEqual([{ type: "group-reply-preset-saved", data: { index: 0 } }]);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
