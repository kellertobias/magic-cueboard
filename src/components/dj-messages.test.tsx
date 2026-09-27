// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocketContext } from "@/contexts/WebSocketContext";
import { DJMessages } from "./dj-messages";

describe("Cueboard message destinations", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("routes presets and typed messages to the selected destination; Back home sends nothing", () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const listeners = new Set<(message: any) => void>();
    const sendMessage = vi.fn();
    const onClose = vi.fn();
    const context = {
      status: "connected" as const, disconnectedSince: null, sendMessage,
      addMessageListener: (listener: (message: any) => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    };
    const container = document.createElement("div");
    const root = createRoot(container);
    const click = (text: string) => act(() => Array.from(container.querySelectorAll("button")).find(button => button.textContent === text)!.click());
    const draft = (text: string) => act(() => {
      const input = container.querySelector("textarea")!;
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, text);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    try {
      act(() => root.render(<WebSocketContext.Provider value={context}><DJMessages open onClose={onClose} /></WebSocketContext.Provider>));
      sendMessage.mockClear();
      click("Ready");
      expect(sendMessage).toHaveBeenLastCalledWith({ type: "send-pi-message", data: { text: "Ready", recipient: "group" } });
      draft("Hello team"); click("Send to group");
      expect(sendMessage).toHaveBeenLastCalledWith({ type: "send-pi-message", data: { text: "Hello team", recipient: "group" } });
      click("DJ display"); draft("Hello DJ"); click("Send to DJ");
      expect(sendMessage).toHaveBeenLastCalledWith({ type: "send-pi-message", data: { text: "Hello DJ", recipient: "dj" } });
      click("You are too loud");
      expect(sendMessage).toHaveBeenLastCalledWith({ type: "send-pi-message", data: { text: "You are too loud", recipient: "dj" } });
      sendMessage.mockClear(); click("Edit presets"); click("You are too loud"); draft("Pi outgoing preset"); click("Save preset");
      expect(sendMessage).toHaveBeenLastCalledWith({ type: "set-pi-preset", data: { index: 0, text: "Pi outgoing preset", recipient: "dj" } });
      click("Done editing"); click("DJ replies"); click("Audio problem"); draft("DJ reply preset"); click("Save preset");
      expect(sendMessage).toHaveBeenLastCalledWith({ type: "set-dj-preset", data: { index: 0, text: "DJ reply preset" } });
      draft(""); click("Save preset");
      expect(sendMessage).toHaveBeenLastCalledWith({ type: "set-dj-preset", data: { index: 0, text: "" } });
      expect(sendMessage.mock.calls.every(([message]) => message.type.startsWith("set-"))).toBe(true);
      sendMessage.mockClear(); click("← Back home");
      expect(onClose).toHaveBeenCalledOnce();
      expect(sendMessage).not.toHaveBeenCalled();
    } finally { act(() => root.unmount()); }
  });
});
