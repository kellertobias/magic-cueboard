// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocketContext } from "@/contexts/WebSocketContext";
import { PHONE_PRESETS_STORAGE_KEY } from "@/lib/pi-messages";
import { PhoneChat } from "./client";

describe("phone chat", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("syncs on connection, sends to the selected recipient, and keeps the draft until acknowledged", () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) });
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
    let root = createRoot(container);
    const render = () => act(() => root.render(<WebSocketContext.Provider value={{ ...context }}><PhoneChat /></WebSocketContext.Provider>));
    const receive = (type: string, data?: unknown) => act(() => listeners.forEach(listener => listener({ type, data })));
    try {
      render();
      const click = (text: string) => act(() => Array.from(container.querySelectorAll("button")).find(button => button.textContent === text)!.click());
      act(() => container.querySelector<HTMLInputElement>('input[value="dj"]')!.click());
      click("Edit saved messages");
      const preset = container.querySelector<HTMLInputElement>('input[aria-label="Saved message 1"]')!;
      act(() => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(preset, "My phone preset");
        preset.dispatchEvent(new Event("input", { bubbles: true }));
      });
      const beforeSave = sendMessage.mock.calls.length;
      click("Save on this phone");
      expect(sendMessage.mock.calls.length).toBe(beforeSave);
      expect(JSON.parse(storage.get(PHONE_PRESETS_STORAGE_KEY)!).dj[0]).toBe("My phone preset");
      click("My phone preset");
      expect(container.querySelector("textarea")!.value).toBe("My phone preset");
      expect(sendMessage.mock.calls.length).toBe(beforeSave);
      expect(sendMessage).toHaveBeenCalledWith({ type: "set-clock", data: { timestamp: expect.any(Number), source: "phone" } });
      expect(container.querySelector<HTMLInputElement>('input[value="dj"]')!.checked).toBe(true);
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
      act(() => root.unmount());
      root = createRoot(container);
      render();
      act(() => container.querySelector<HTMLInputElement>('input[value="dj"]')!.click());
      expect(container.textContent).toContain("My phone preset");
      receive("pi-messages-state", { presets: [], history: [], groupReplyPresets: ["Shared reply", "", "", "", "", ""] });
      act(() => container.querySelector<HTMLInputElement>('input[value="group"]')!.click());
      expect(container.textContent).toContain("Shared reply");
    } finally { act(() => root.unmount()); }
  });
});
