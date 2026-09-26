"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useWebSocket } from "@/hooks/useWebSocket";
import { defaultPiMessagesState, type PiMessagesState } from "@/lib/pi-messages";

import { defaultSPLSettings, type SPLSettings } from "@/lib/spl-settings";

const keyboardRows = ["1234567890", "QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];

export function DJMessages({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState<"technician" | "dj">("technician");
  const [djSettings, setDJSettings] = useState<SPLSettings>(defaultSPLSettings);
  const [shift, setShift] = useState(true);
  const [error, setError] = useState("");
  const [piMessages, setPiMessages] = useState<PiMessagesState>(defaultPiMessagesState);
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null);
  const messageInput = useRef<HTMLTextAreaElement>(null);
  const historyScroll = useRef<HTMLDivElement>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heldPreset = useRef<number | null>(null);
  const handleMessage = useCallback((event: { type: string; data: any }) => {
    if (event.type === "dj-message") setToast({ id: Date.now(), message: event.data.message });
    if (event.type === "pi-messages-state") setPiMessages(event.data);
    if (event.type === "spl-settings") setDJSettings(event.data);
    if (event.type === "spl-settings-error") setError(event.data.message);
    if (event.type === "pi-message-error") setError(event.data.message);
    if (event.type === "pi-message-sent") { setDraft(""); setError(""); messageInput.current?.focus(); }
  }, []);
  const { status, sendMessage } = useWebSocket(handleMessage, []);

  useEffect(() => { if (open && status === "connected") { sendMessage({ type: "get-pi-messages" }); sendMessage({ type: "get-spl-settings" }); } }, [open, status, sendMessage]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(current => current?.id === toast.id ? null : current), 8000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => { if (open) messageInput.current?.focus(); }, [open]);
  useEffect(() => {
    if (open && historyScroll.current) historyScroll.current.scrollTop = historyScroll.current.scrollHeight;
  }, [open, piMessages.history[piMessages.history.length - 1]?.id]);
  useEffect(() => () => { if (holdTimer.current) clearTimeout(holdTimer.current); }, []);

  const editDraft = (character: string, erase = false) => {
    const input = messageInput.current;
    const start = input?.selectionStart ?? draft.length;
    const end = input?.selectionEnd ?? start;
    const from = erase && start === end ? Math.max(0, start - 1) : start;
    const next = (draft.slice(0, from) + character + draft.slice(end)).slice(0, 160);
    const caret = Math.min(from + character.length, next.length);
    setDraft(next);
    requestAnimationFrame(() => { input?.focus(); input?.setSelectionRange(caret, caret); });
  };
  const insert = (character: string) => { editDraft(character); if (shift) setShift(false); };
  const keyboardPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => event.preventDefault();
  const send = (text: string) => {
    if (status !== "connected") { setError("Qboard is disconnected."); return; }
    if (!text.trim()) return;
    setError("");
    sendMessage({ type: "send-pi-message", data: { text: text.trim() } });
  };
  const stopHold = () => { if (holdTimer.current) clearTimeout(holdTimer.current); holdTimer.current = null; };
  const startHold = (index: number) => {
    stopHold();
    heldPreset.current = null;
    holdTimer.current = setTimeout(() => {
      heldPreset.current = index;
      if (!draft.trim()) { setError("Type a message before holding a preset."); return; }
      if (status !== "connected") { setError("Qboard is disconnected."); return; }
      setError("");
      if (mode === "dj") sendMessage({ type: "set-dj-preset", data: { index, text: draft.trim() } });
      else sendMessage({ type: "set-pi-preset", data: { index, text: draft.trim() } });
    }, 650);
  };

  return <>
    {open && <div className="absolute inset-0 z-20 flex flex-col bg-gray-950 p-3 text-white">
      <div className="grid min-h-0 flex-1 grid-cols-[0.85fr_1fr_1.25fr] gap-3">
        <section className="flex min-h-0 min-w-0 flex-col gap-2" aria-label="Message presets">
          <div className="flex items-center gap-3"><button type="button" onClick={onClose} className="rounded-lg border border-amber-500 bg-amber-900 px-4 py-2 text-sm font-semibold">Back to keyboard</button><button type="button" aria-label="Switch DJ and technician messages" onClick={() => setMode(value => value === "dj" ? "technician" : "dj")} className="rounded border border-gray-600 bg-gray-900 px-2 py-2 text-sm"><span className={mode === "dj" ? "font-bold text-blue-300" : "text-gray-400"}>DJ</span> / <span className={mode === "technician" ? "font-bold text-blue-300" : "text-gray-400"}>Technician</span></button></div>
          <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-3 gap-2">
          {(mode === "dj" ? djSettings.messages : piMessages.presets).map((message, index) => <button key={index} type="button" disabled={status !== "connected"}
            onPointerDown={() => startHold(index)} onPointerUp={stopHold} onPointerCancel={stopHold} onPointerLeave={stopHold}
            onClick={() => { if (heldPreset.current === index) { heldPreset.current = null; return; } if (message) { if (mode === "dj") sendMessage({ type: "send-dj-message", data: { index } }); else send(message); } }}
            className={`min-h-0 touch-none rounded-xl border p-2 text-base font-semibold ${message ? "border-blue-600 bg-blue-950" : "border-gray-700 bg-gray-800 text-gray-400"} disabled:opacity-50`}>{message || "[empty]"}</button>)}
          </div>
        </section>
        <section className="flex min-h-0 min-w-0 flex-col border-x border-gray-700 px-3" aria-label="Conversation">
          <div ref={historyScroll} className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pb-2" aria-label="Message history">
            {piMessages.history.length === 0 && <p className="pt-4 text-center text-sm text-gray-500">Messages will appear here</p>}
            {piMessages.history.map(item => <div key={item.id} className={`flex flex-col ${item.direction === "sent" ? "items-end" : "items-start"}`}>
              <div className={`max-w-[90%] break-words whitespace-pre-wrap rounded-lg px-2.5 py-1.5 text-sm ${item.direction === "sent" ? "bg-blue-800" : "bg-gray-800"}`}>{item.text}</div>
              <time dateTime={item.timestamp} className="mt-0.5 text-[11px] text-gray-400">{item.direction === "sent" ? "Sent" : "Received"} · {new Date(item.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
            </div>)}
          </div>
          {error && <p role="alert" className="pb-1 text-xs text-red-300">{error}</p>}
          <div className="flex gap-1.5 border-t border-gray-700 pt-2">
            <textarea ref={messageInput} aria-label="Current message" maxLength={160} value={draft} onChange={event => setDraft(event.target.value)} placeholder="Type a message…"
              className="h-14 min-w-0 flex-1 resize-none rounded-lg border border-gray-600 bg-gray-900 px-2 py-1.5 text-sm text-white caret-blue-300 outline-none focus:border-blue-400" />
            <button type="button" onClick={() => send(draft)} disabled={!draft.trim() || status !== "connected"}
              className="rounded-lg bg-blue-600 px-3 text-sm font-semibold disabled:bg-gray-700 disabled:text-gray-400">Send</button>
          </div>
        </section>

        <section className="flex min-h-0 min-w-0 flex-col gap-1.5" aria-label="On-screen keyboard">
          {keyboardRows.map((row, rowIndex) => <div key={row} className="flex min-h-0 flex-1 gap-1">
            {rowIndex === 3 && <button type="button" onPointerDown={keyboardPointerDown} onClick={() => { setShift(value => !value); messageInput.current?.focus(); }} className="min-w-0 flex-[1.5] rounded border border-gray-600 bg-gray-800 text-xs">Shift</button>}
            {Array.from(row).map(letter => <button key={letter} type="button" onPointerDown={keyboardPointerDown} onClick={() => insert(shift ? letter : letter.toLowerCase())}
              className="min-w-0 flex-1 rounded border border-gray-600 bg-gray-800 text-sm font-semibold active:bg-blue-700">{shift ? letter : letter.toLowerCase()}</button>)}
            {rowIndex === 0 && <button type="button" aria-label="Backspace" onPointerDown={keyboardPointerDown} onClick={() => editDraft("", true)} className="min-w-0 flex-[1.8] rounded border border-gray-600 bg-gray-800 text-lg">⌫</button>}
            {rowIndex === 3 && <><button type="button" onPointerDown={keyboardPointerDown} onClick={() => insert("?")} className="min-w-0 flex-1 rounded border border-gray-600 bg-gray-800">?</button><button type="button" onPointerDown={keyboardPointerDown} onClick={() => insert("!")} className="min-w-0 flex-1 rounded border border-gray-600 bg-gray-800">!</button></>}
          </div>)}
          <div className="flex min-h-0 flex-1 gap-1">
            <button type="button" onPointerDown={keyboardPointerDown} onClick={() => insert("-")} className="min-w-0 flex-1 rounded border border-gray-600 bg-gray-800">−</button>
            <button type="button" onPointerDown={keyboardPointerDown} onClick={() => insert("+")} className="min-w-0 flex-1 rounded border border-gray-600 bg-gray-800">+</button>
            <button type="button" onPointerDown={keyboardPointerDown} onClick={() => insert(",")} className="min-w-0 flex-1 rounded border border-gray-600 bg-gray-800">,</button>
            <button type="button" onPointerDown={keyboardPointerDown} onClick={() => insert(" ")} className="min-w-0 flex-[5] rounded border border-gray-600 bg-gray-800 text-xs">Space</button>
            <button type="button" onPointerDown={keyboardPointerDown} onClick={() => insert(".")} className="min-w-0 flex-1 rounded border border-gray-600 bg-gray-800">.</button>
          </div>
        </section>
      </div>
    </div>}
    {toast && !open && <div role="status" className="absolute bottom-3 right-3 z-30 max-w-lg rounded-lg border border-blue-400 bg-blue-950 px-5 py-3 text-lg font-semibold text-white shadow-xl">
      <span className="mr-3 text-blue-300">Incoming message</span>{toast.message}
      <button type="button" onClick={() => setToast(null)} className="ml-4 text-gray-300" aria-label="Dismiss message">×</button>
    </div>}
  </>;
}
