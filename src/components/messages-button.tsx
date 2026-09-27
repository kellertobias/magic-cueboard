"use client";

import React, { useEffect, useState } from "react";
import clsx from "clsx";
import { useWebSocket } from "@/hooks/useWebSocket";

const BLINK_DURATION_MS = 15 * 60 * 1000;

export function MessagesButton({ open, onOpen }: { open: boolean; onOpen: () => void }) {
  const [blinkUntil, setBlinkUntil] = useState<number | null>(null);
  const [blinking, setBlinking] = useState(false);

  useWebSocket((message: { type: string }) => {
    if (message.type === "dj-message" && !open) {
      setBlinkUntil(Date.now() + BLINK_DURATION_MS);
      setBlinking(true);
    }
  }, [open]);

  useEffect(() => {
    if (open) {
      setBlinkUntil(null);
      setBlinking(false);
    }
  }, [open]);

  useEffect(() => {
    if (blinkUntil === null) return;
    const timer = setTimeout(() => setBlinking(false), Math.max(0, blinkUntil - Date.now()));
    return () => clearTimeout(timer);
  }, [blinkUntil]);

  const unread = !open && blinkUntil !== null;
  return <button type="button" onClick={() => {
    setBlinkUntil(null);
    setBlinking(false);
    onOpen();
  }} aria-label={unread ? "Messages, new notification" : "Messages"}
    title="Messages" className={clsx("relative flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-gray-600 text-gray-300 hover:bg-gray-800 focus-visible:outline focus-visible:outline-blue-400", { "messages-blink": unread && blinking })}>
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 6 9 7 9-7" /></svg>
    {unread && !blinking && <span aria-hidden="true" className="absolute right-1 top-1 h-2 w-2 rounded-full bg-red-500" />}
  </button>;
}
