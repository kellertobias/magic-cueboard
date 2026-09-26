"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useWebSocket } from "@/hooks/useWebSocket";

const piPresets = ["You are too loud", "You are too quiet"];
const keyboardRows = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];

export function DJMessages({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [draft, setDraft] = useState("");
  const [shift, setShift] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null);
  const messageInput = useRef<HTMLTextAreaElement>(null);
  const handleMessage = useCallback((event: { type: string; data: any }) => {
    if (event.type === "dj-message") setToast({ id: Date.now(), message: event.data.message });
    if (event.type === "pi-message-error") setError(event.data.message);
    if (event.type === "pi-message-sent") { setDraft(""); setError(""); onClose(); }
  }, [onClose]);
  const { status, sendMessage } = useWebSocket(handleMessage, [onClose]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(current => current?.id === toast.id ? null : current), 8000);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (open) messageInput.current?.focus();
  }, [open]);

  const editDraft = (character: string, erase = false) => {
    const input = messageInput.current;
    const start = input?.selectionStart ?? draft.length;
    const end = input?.selectionEnd ?? start;
    const from = erase && start === end ? Math.max(0, start - 1) : start;
    const next = (draft.slice(0, from) + character + draft.slice(end)).slice(0, 160);
    const caret = Math.min(from + character.length, next.length);
    setDraft(next);
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(caret, caret);
    });
  };
  const insert = (character: string) => { editDraft(character); if (shift) setShift(false); };
  const keyboardPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => event.preventDefault();
  const send = (text: string) => {
    if (status !== "connected") { setError("Qboard is disconnected."); return; }
    if (!text.trim()) return;
    setError("");
    sendMessage({ type: "send-pi-message", data: { text: text.trim() } });
  };

  return <>
    {open && <div className="absolute inset-0 z-20 flex flex-col bg-gray-950 p-4 text-white">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xl font-bold">Send a message to the DJ display</h2>
        <button type="button" onClick={onClose} className="rounded border border-gray-600 px-4 py-1.5 text-sm">Back to Qboard</button>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[2fr_1fr] gap-5">
        <div className="flex min-h-0 flex-col gap-2">
          <div className="flex gap-2">
            <textarea ref={messageInput} aria-label="Custom message" maxLength={160} value={draft} onChange={event => setDraft(event.target.value)} placeholder="Type a custom message…"
              className="h-14 flex-1 resize-none rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-base text-white caret-blue-300 outline-none focus:border-blue-400" />
            <button type="button" onClick={() => send(draft)} disabled={!draft.trim() || status !== "connected"}
              className="rounded-lg bg-blue-600 px-5 font-semibold disabled:bg-gray-700 disabled:text-gray-400">Send</button>
          </div>
          <div className="flex w-full max-w-[700px] flex-col gap-1.5" aria-label="On-screen keyboard">
            {keyboardRows.map((row, rowIndex) => <div key={row} className="flex justify-center gap-1.5">
              {rowIndex === 2 && <button type="button" onPointerDown={keyboardPointerDown} onClick={() => { setShift(value => !value); messageInput.current?.focus(); }} className="h-9 min-w-0 flex-[1.5] rounded border border-gray-600 bg-gray-800 text-xs">Shift</button>}
              {Array.from(row).map(letter => <button key={letter} type="button" onPointerDown={keyboardPointerDown} onClick={() => insert(shift ? letter : letter.toLowerCase())}
                className="h-9 min-w-0 flex-1 rounded border border-gray-600 bg-gray-800 text-sm font-semibold active:bg-blue-700">{shift ? letter : letter.toLowerCase()}</button>)}
              {rowIndex === 0 && <button type="button" onPointerDown={keyboardPointerDown} onClick={() => editDraft("", true)} className="h-9 min-w-0 flex-[1.8] rounded border border-gray-600 bg-gray-800 text-xs">⌫</button>}
              {rowIndex === 2 && <><button type="button" onPointerDown={keyboardPointerDown} onClick={() => insert("?")} className="h-9 min-w-0 flex-1 rounded border border-gray-600 bg-gray-800">?</button><button type="button" onPointerDown={keyboardPointerDown} onClick={() => insert("!")} className="h-9 min-w-0 flex-1 rounded border border-gray-600 bg-gray-800">!</button></>}
            </div>)}
            <div className="flex gap-1.5">
              <button type="button" onPointerDown={keyboardPointerDown} onClick={() => insert("-")} className="h-9 min-w-0 flex-1 rounded border border-gray-600 bg-gray-800">−</button>
              <button type="button" onPointerDown={keyboardPointerDown} onClick={() => insert("+")} className="h-9 min-w-0 flex-1 rounded border border-gray-600 bg-gray-800">+</button>
              <button type="button" onPointerDown={keyboardPointerDown} onClick={() => insert(",")} className="h-9 min-w-0 flex-1 rounded border border-gray-600 bg-gray-800">,</button>
              <button type="button" onPointerDown={keyboardPointerDown} onClick={() => insert(" ")} className="h-9 min-w-0 flex-[5] rounded border border-gray-600 bg-gray-800 text-xs">Space</button>
              <button type="button" onPointerDown={keyboardPointerDown} onClick={() => insert(".")} className="h-9 min-w-0 flex-1 rounded border border-gray-600 bg-gray-800">.</button>
            </div>
          </div>
          {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
        </div>
        <div className="flex flex-col gap-3 border-l border-gray-700 pl-5">
          <h3 className="text-sm uppercase tracking-wide text-gray-400">Pi presets</h3>
          {piPresets.map(message => <button key={message} type="button" disabled={status !== "connected"} onClick={() => send(message)}
            className="flex-1 rounded-xl border border-blue-600 bg-blue-950 p-3 text-xl font-semibold disabled:border-gray-700 disabled:bg-gray-900 disabled:text-gray-500">{message}</button>)}
        </div>
      </div>
    </div>}
    {toast && <div role="status" className="absolute bottom-3 right-3 z-30 max-w-lg rounded-lg border border-blue-400 bg-blue-950 px-5 py-3 text-lg font-semibold text-white shadow-xl">
      <span className="mr-3 text-blue-300">Incoming message</span>{toast.message}
      <button type="button" onClick={() => setToast(null)} className="ml-4 text-gray-300" aria-label="Dismiss message">×</button>
    </div>}
  </>;
}
