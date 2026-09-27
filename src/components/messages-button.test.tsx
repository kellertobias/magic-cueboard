// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebSocketContext } from "@/contexts/WebSocketContext";
import { MessagesButton } from "./messages-button";

describe("Messages notifications", () => {
  let root: Root;
  let container: HTMLDivElement;
  const listeners = new Set<(message: { type: string }) => void>();
  const context = {
    status: "connected" as const,
    disconnectedSince: null,
    sendMessage: vi.fn(),
    addMessageListener: (listener: (message: { type: string }) => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
  const onOpen = vi.fn();
  const render = (open = false) => act(() => root.render(
    <WebSocketContext.Provider value={context}><MessagesButton open={open} onOpen={onOpen} /></WebSocketContext.Provider>
  ));
  const receive = (type = "dj-message") => act(() => { listeners.forEach(listener => listener({ type })); });
  const advance = (milliseconds: number) => act(() => vi.advanceTimersByTime(milliseconds));
  const button = () => container.querySelector("button")!;
  const dot = () => container.querySelector("span.bg-red-500");

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    onOpen.mockClear();
    container = document.createElement("div");
    root = createRoot(container);
    render();
  });
  afterEach(() => {
    act(() => root.unmount());
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("blinks for exactly 15 minutes, then keeps a red dot until opened", () => {
    receive("pi-message-sent");
    receive("pi-messages-state");
    expect(button().getAttribute("aria-label")).toBe("Messages");
    receive();
    expect(button().classList.contains("messages-blink")).toBe(true);
    expect(dot()).toBeNull();
    advance(15 * 60 * 1000 - 1);
    expect(button().classList.contains("messages-blink")).toBe(true);
    advance(1);
    expect(button().classList.contains("messages-blink")).toBe(false);
    expect(dot()).not.toBeNull();
    advance(60 * 60 * 1000);
    expect(dot()).not.toBeNull();
    act(() => button().click());
    expect(onOpen).toHaveBeenCalledOnce();
    expect(dot()).toBeNull();
    expect(button().getAttribute("aria-label")).toBe("Messages");
  });

  it("clears the blink when opened and treats messages in the open conversation as read", () => {
    receive();
    render(true);
    receive();
    render(false);
    advance(15 * 60 * 1000);
    expect(button().classList.contains("messages-blink")).toBe(false);
    expect(dot()).toBeNull();
    expect(button().getAttribute("aria-label")).toBe("Messages");
  });

  it("restarts the blink window for each incoming message, including after expiry", () => {
    receive();
    advance(14 * 60 * 1000);
    receive();
    advance(60 * 1000);
    expect(button().classList.contains("messages-blink")).toBe(true);
    advance(14 * 60 * 1000);
    expect(dot()).not.toBeNull();
    receive();
    expect(dot()).toBeNull();
    expect(button().classList.contains("messages-blink")).toBe(true);
    advance(15 * 60 * 1000);
    expect(dot()).not.toBeNull();
  });
});
