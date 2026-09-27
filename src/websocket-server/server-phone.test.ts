import { describe, expect, it, vi } from "vitest";
import { WebSocketService } from "./server";

function setup() {
  const runtime = Object.create(WebSocketService.prototype);
  runtime.splSettings = { messageTopic: "dj/messages" };
  runtime.piMessages = { presets: [], history: [] };
  runtime.savePiMessages = vi.fn();
  runtime.mqttBroker = { publishText: vi.fn() };
  runtime.broadcast = vi.fn();
  const replies: any[] = [];
  const ws = { send: (text: string) => replies.push(JSON.parse(text)) };
  return { runtime, ws, replies };
}

describe("phone chat routing", () => {
  it.each(["technician", "dj", "group"])("records and notifies the technician about messages addressed to %s", async recipient => {
    const { runtime, ws, replies } = setup();
    await runtime.handleWebSocketMessage(ws, JSON.stringify({ type: "send-phone-message", data: { text: " Hello ", recipient } }));
    expect(runtime.piMessages.history).toHaveLength(1);
    expect(runtime.piMessages.history[0]).toMatchObject({ text: "Hello", direction: "received", sender: "phone", recipient });
    expect(runtime.broadcast).toHaveBeenCalledWith({ type: "pi-messages-state", data: runtime.piMessages });
    expect(runtime.broadcast).toHaveBeenCalledWith({ type: "dj-message", data: { message: "Hello", sender: "phone", recipient } });
    if (recipient === "dj") expect(runtime.mqttBroker.publishText.mock.calls).toEqual([["dj/messages", "Hello"], ["tosklight/dj/display-inbox", "Hello"]]);
    else expect(runtime.mqttBroker.publishText).not.toHaveBeenCalled();
    expect(replies).toEqual([{ type: "phone-message-sent" }]);
  });
  it.each([{ text: "hello", recipient: "all" }, { text: " ", recipient: "dj" }, { text: "x".repeat(161), recipient: "technician" }])("rejects invalid messages without recording or forwarding them", async data => {
    const { runtime, ws, replies } = setup();
    await runtime.handleWebSocketMessage(ws, JSON.stringify({ type: "send-phone-message", data }));
    expect(replies[0].type).toBe("phone-message-error");
    expect(runtime.piMessages.history).toHaveLength(0);
    expect(runtime.mqttBroker.publishText).not.toHaveBeenCalled();
    expect(runtime.broadcast).not.toHaveBeenCalled();
  });
});

describe("clock protocol", () => {
  it("acknowledges and broadcasts only a successful clock update", async () => {
    const { runtime, ws, replies } = setup();
    const state = { timestamp: 1790512215000, timeZone: "Europe/Berlin" };
    runtime.systemClock = { set: vi.fn().mockResolvedValue(state), snapshot: () => state };
    await runtime.handleWebSocketMessage(ws, JSON.stringify({ type: "get-clock" }));
    expect(replies.pop()).toEqual({ type: "clock-state", data: state });
    await runtime.handleWebSocketMessage(ws, JSON.stringify({ type: "set-clock", data: { timestamp: state.timestamp, source: "phone" } }));
    expect(runtime.systemClock.set).toHaveBeenCalledWith(state.timestamp, "phone");
    expect(runtime.broadcast).toHaveBeenCalledWith({ type: "clock-state", data: state });
    expect(replies.pop()).toEqual({ type: "clock-saved", data: state });
    runtime.broadcast.mockClear();
    runtime.systemClock.set.mockRejectedValue(new Error("Permission denied"));
    await runtime.handleWebSocketMessage(ws, JSON.stringify({ type: "set-clock", data: { timestamp: state.timestamp, source: "manual" } }));
    expect(replies.pop()).toEqual({ type: "clock-error", data: { message: "Permission denied" } });
    expect(runtime.broadcast).not.toHaveBeenCalled();
  });
});

describe("Cueboard destination routing", () => {
  it.each(["dj", "group", undefined])("routes messages to %s and records the destination", async recipient => {
    const { runtime, ws, replies } = setup();
    await runtime.handleWebSocketMessage(ws, JSON.stringify({ type: "send-pi-message", data: { text: " Hello ", recipient } }));
    expect(runtime.piMessages.history[0]).toMatchObject({ text: "Hello", sender: "qboard", recipient: recipient ?? "dj" });
    expect(runtime.broadcast).toHaveBeenCalledWith({ type: "pi-messages-state", data: runtime.piMessages });
    if (recipient === "group") expect(runtime.mqttBroker.publishText).not.toHaveBeenCalled();
    else expect(runtime.mqttBroker.publishText.mock.calls).toEqual([["dj/messages", "Hello"], ["tosklight/dj/display-inbox", "Hello"]]);
    expect(replies).toEqual([{ type: "pi-message-sent" }]);
  });
  it("rejects unknown destinations without sending anything", async () => {
    const { runtime, ws, replies } = setup();
    await runtime.handleWebSocketMessage(ws, JSON.stringify({ type: "send-pi-message", data: { text: "Hello", recipient: "private-phone" } }));
    expect(runtime.mqttBroker.publishText).not.toHaveBeenCalled();
    expect(runtime.piMessages.history).toHaveLength(0);
    expect(replies[0].type).toBe("pi-message-error");
  });
  it("records DJ preset destinations and acknowledges the send", async () => {
    const { runtime, ws, replies } = setup();
    runtime.splSettings.messages = ["Hello DJ"];
    await runtime.handleWebSocketMessage(ws, JSON.stringify({ type: "send-dj-message", data: { index: 0 } }));
    expect(runtime.piMessages.history[0]).toMatchObject({ text: "Hello DJ", recipient: "dj", sender: "qboard" });
    expect(replies).toEqual([{ type: "pi-message-sent" }]);
  });
});
