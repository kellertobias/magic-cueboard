"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useWebSocket } from "@/hooks/useWebSocket";
import { defaultGroupReplyPresets, defaultPiMessagesState, defaultPiOutgoingPresets, validatePiMessagesState, messageRecipientLabel, type PiMessagesState } from "@/lib/pi-messages";

import { defaultSPLSettings } from "@/lib/spl-settings";

const keyboardRows = ["1234567890", "QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];

export function DJMessages({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState<"group" | "dj">("group");
  const [editor, setEditor] = useState<"party" | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null);
  const [djReplies, setDJReplies] = useState(defaultSPLSettings.messages);
  const [shift, setShift] = useState(true);
  const [error, setError] = useState("");
  const [savedNotice, setSavedNotice] = useState("");
  const [piMessages, setPiMessages] = useState<PiMessagesState>(defaultPiMessagesState);
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null);
  const messageInput = useRef<HTMLTextAreaElement>(null);
  const historyScroll = useRef<HTMLDivElement>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heldPreset = useRef<number | null>(null);
  const destinationHoldTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heldDestination = useRef<"group" | "dj" | null>(null);
  const handleMessage = useCallback((event: { type: string; data: any }) => {
    if (event.type === "dj-message") setToast({ id: Date.now(), message: event.data.message });
    if (event.type === "pi-messages-state") setPiMessages(validatePiMessagesState(event.data));
    if (event.type === "spl-settings") setDJReplies(event.data.messages);
    if (event.type === "dj-preset-saved") setSavedNotice(`DJ reply ${event.data.index + 1} saved`);
    if (event.type === "group-reply-preset-saved") setSavedNotice(`Group reply ${event.data.index + 1} saved for every phone`);
    if (event.type === "pi-preset-saved") setSavedNotice(`Preset ${event.data.index + 1} saved on this Cueboard`);
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
  useEffect(() => () => { if (holdTimer.current) clearTimeout(holdTimer.current); if (destinationHoldTimer.current) clearTimeout(destinationHoldTimer.current); }, []);

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
    sendMessage({ type: "send-pi-message", data: { text: text.trim(), recipient: mode } });
  };
  const stopHold = () => { if (holdTimer.current) clearTimeout(holdTimer.current); holdTimer.current = null; };
  const startHold = (index: number) => {
    stopHold();
    setSavedNotice("");
    heldPreset.current = null;
    holdTimer.current = setTimeout(() => {
      heldPreset.current = index;
      if (!draft.trim()) { setError("Type a message before holding a preset."); return; }
      if (status !== "connected") { setError("Qboard is disconnected."); return; }
      setError("");
      if (editor === "party") sendMessage({ type: mode === "dj" ? "set-dj-preset" : "set-group-reply-preset", data: { index, text: draft.trim() } });
      else sendMessage({ type: "set-pi-preset", data: { index, text: draft.trim(), recipient: mode } });
    }, 650);
  };
  const stopDestinationHold = () => { if (destinationHoldTimer.current) clearTimeout(destinationHoldTimer.current); destinationHoldTimer.current = null; };
  const startDestinationHold = (nextMode: "group" | "dj") => {
    stopDestinationHold();
    heldDestination.current = null;
    destinationHoldTimer.current = setTimeout(() => {
      heldDestination.current = nextMode;
      setMode(nextMode); setEditor("party"); setSelectedPreset(null); setDraft(""); setSavedNotice(""); setError("");
    }, 650);
  };
  const chooseDestination = (nextMode: "group" | "dj") => {
    if (heldDestination.current === nextMode) { heldDestination.current = null; return; }
    setMode(nextMode); setEditor(null); setSelectedPreset(null); setSavedNotice(""); setError("");
  };
  const partyPresets = mode === "dj" ? djReplies : piMessages.groupReplyPresets ?? defaultGroupReplyPresets;

  return <>
    {open && <div className="cueboard-messages" role="dialog" aria-modal="true" aria-label="Messages">
      <div className="cueboard-messages-layout">
        <section className="cueboard-message-sidebar" aria-label="Message presets">
          <header className="cueboard-message-navigation"><button type="button" onClick={() => { stopHold(); setEditor(null); setSelectedPreset(null); onClose(); }} className="cueboard-home-button">← Back home</button><h2>Messages</h2></header>
          <div className="cueboard-message-destinations" role="group" aria-label="Send to">
            <span className="cueboard-section-label">{editor ? `Messages ${mode === "dj" ? "the DJ" : "group phones"} can send` : "Send to"}</span>
            <div className="grid grid-cols-2 gap-2">
              {(["dj", "group"] as const).map(destination => <button key={destination} type="button" aria-pressed={mode === destination}
                onPointerDown={() => startDestinationHold(destination)} onPointerUp={stopDestinationHold} onPointerCancel={stopDestinationHold} onPointerLeave={stopDestinationHold}
                onClick={() => chooseDestination(destination)} className="cueboard-destination-button">{destination === "dj" ? "DJ display" : "Group chat"}</button>)}
            </div>
            <p>{editor ? "Type a reply, then hold a slot for 650 ms to replace it." : mode === "dj" ? "DJ display · visible in shared history" : "Shared conversation · all mobile remotes"} Hold a destination to edit that party’s replies.</p>
          </div>
          <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-3 gap-1.5">
          {(editor ? partyPresets : (piMessages.outgoingPresets ?? defaultPiOutgoingPresets)[mode]).map((message, index) => <button key={index} type="button" disabled={status !== "connected"}
            onPointerDown={() => startHold(index)} onPointerUp={stopHold} onPointerCancel={stopHold} onPointerLeave={stopHold}
            onClick={() => { if (editor) { setSelectedPreset(index); setDraft(message); setSavedNotice(""); messageInput.current?.focus(); return; } if (heldPreset.current === index) { heldPreset.current = null; return; } if (message) send(message); }}
            aria-pressed={editor ? selectedPreset === index : undefined}
            className={`min-h-0 touch-none rounded-xl border p-2 text-base font-semibold ${message ? editor ? "border-violet-400 bg-violet-950 text-violet-100" : mode === "dj" ? "border-sky-400 bg-sky-900 text-sky-100" : "border-blue-600 bg-blue-950" : "border-gray-700 bg-gray-800 text-gray-400"} disabled:opacity-50`}>{message || "[empty]"}</button>)}
          </div>
        </section>
        <div className="cueboard-message-workspace">
        <section className="flex min-h-0 min-w-0 flex-col border-r border-gray-700 pr-3" aria-label="Conversation">
          <header className="cueboard-conversation-heading">{editor ? `Configure ${mode === "dj" ? "DJ" : "group phone"} replies` : mode === "dj" ? "To DJ display" : "To group chat"}<span>{editor ? "Hold a slot to save · does not send" : "Shared message history"}</span></header>
          <div className="mb-2 flex gap-2" aria-label="Preset configuration">
            {editor && <button type="button" className="cueboard-home-button" onClick={() => { stopHold(); setEditor(null); setSelectedPreset(null); setDraft(""); setSavedNotice(""); }}>Done editing</button>}
          </div>
          <div ref={historyScroll} className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pb-2" aria-label="Message history">
            {editor && <p className="pt-3 text-sm text-gray-400">{mode === "dj" ? "These six replies are available on the DJ display." : "These six replies are shared with every group-chat phone."}{selectedPreset !== null ? ` Editing slot ${selectedPreset + 1}. Hold that slot to save; clear the text to empty it.` : " Select a slot to edit."}</p>}
            {!editor && piMessages.history.length === 0 && <p className="pt-4 text-center text-sm text-gray-500">Messages will appear here</p>}
            {!editor && piMessages.history.map(item => <div key={item.id} className={`flex flex-col ${item.direction === "sent" ? "items-end" : "items-start"}`}>
              <div className={`max-w-[90%] break-words whitespace-pre-wrap rounded-lg px-2.5 py-1.5 text-sm ${item.direction === "sent" ? "bg-blue-800" : "bg-gray-800"}`}>{item.text}</div>
              <time dateTime={item.timestamp} className="mt-0.5 text-[11px] text-gray-400">{item.sender === "phone" ? "Phone" : item.direction === "sent" ? "Sent" : "Received"}{item.recipient ? ` → ${messageRecipientLabel(item.recipient)}` : ""} · {new Date(item.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
            </div>)}
          </div>
          {savedNotice && <p role="status" className="pb-1 text-xs text-green-400">{savedNotice}</p>}
          {error && <p role="alert" className="pb-1 text-xs text-red-300">{error}</p>}
          <div className="flex gap-1.5 border-t border-gray-700 pt-2">
            <textarea ref={messageInput} aria-label="Current message" maxLength={160} value={draft} onChange={event => setDraft(event.target.value)} placeholder={editor ? "Choose a slot and enter preset text…" : mode === "dj" ? "Message to DJ display…" : "Message to group chat…"}
              className="h-14 min-w-0 flex-1 resize-none rounded-lg border border-gray-600 bg-gray-900 px-2 py-1.5 text-sm text-white caret-blue-300 outline-none focus:border-blue-400" />
            <button type="button" onClick={() => {
              if (!editor) { send(draft); return; }
              return;
            }} disabled={(editor ? selectedPreset === null : !draft.trim()) || status !== "connected"}
              className="rounded-lg bg-blue-600 px-3 text-sm font-semibold disabled:bg-gray-700 disabled:text-gray-400">{editor ? "Hold slot to save" : mode === "dj" ? "Send to DJ" : "Send to group"}</button>
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
      </div>
    </div>}
    {toast && !open && <div role="status" className="absolute bottom-3 right-3 z-30 max-w-lg rounded-lg border border-blue-400 bg-blue-950 px-5 py-3 text-lg font-semibold text-white shadow-xl">
      <span className="mr-3 text-blue-300">Incoming message</span>{toast.message}
      <button type="button" onClick={() => setToast(null)} className="ml-4 text-gray-300" aria-label="Dismiss message">×</button>
    </div>}
  </>;
}
