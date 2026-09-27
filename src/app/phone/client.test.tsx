// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocketContext } from "@/contexts/WebSocketContext";
import { PhoneChat } from "./client";

describe("phone chat", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("syncs on connection, sends to the selected recipient, and keeps the draft until acknowledged", () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const listeners = new Set<(message: any) => void>();
    const sendMessage = vi.fn();
    const context = {
      status: "connected" as "connected" | "disconnected",
      disconnectedSince: null,
      sendMessage,
      addMessageListener: (listener: (message: any) => void) => {
        listeners.add(listener);
        return () => { listeners.delete(listener); };
      },
    };
    const container = document.createElement("div");
    const root = createRoot(container);
    const render = () => act(() => root.render(<WebSocketContext.Provider value={{ ...context }}><PhoneChat /></WebSocketContext.Provider>));
    const receive = (type: string, data?: unknown) => act(() => listeners.forEach(listener => listener({ type, data })));
    try {
      render();
      expect(sendMessage).toHaveBeenCalledWith({ type: "set-clock", data: { timestamp: expect.any(Number), source: "phone" } });
      expect(container.querySelector<HTMLInputElement>('input[value="technician"]')!.checked).toBe(true);
      act(() => container.querySelector<HTMLInputElement>('input[value="dj"]')!.click());
      const textarea = container.querySelector("textarea")!;
      act(() => {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(textarea, "Hello DJ");
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
      });
      act(() => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
      expect(sendMessage).toHaveBeenLastCalledWith({ type: "send-phone-message", data: { text: "Hello DJ", recipient: "dj" } });
      expect(textarea.value).toBe("Hello DJ");
      expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);
      receive("phone-message-error", { message: "Try again" });
      expect(textarea.value).toBe("Hello DJ");
      expect(container.textContent).toContain("Try again");
      act(() => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
      receive("phone-message-sent");
      expect(textarea.value).toBe("");
      context.status = "disconnected";
      render();
      expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);
      context.status = "connected";
      render();
      expect(sendMessage.mock.calls.filter(([message]) => message.type === "set-clock")).toHaveLength(2);
    } finally { act(() => root.unmount()); }
  });
});
