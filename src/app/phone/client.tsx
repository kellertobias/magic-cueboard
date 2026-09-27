"use client";

import React, { useEffect, useRef, useState } from "react";
import { WebSocketProvider } from "@/contexts/WebSocketContext";
import { useWebSocket } from "@/hooks/useWebSocket";
import { defaultPiMessagesState, defaultPhonePresets, validatePresetSets, PHONE_PRESETS_STORAGE_KEY, type MessagePresetSets, messageRecipientLabel, type PiMessagesState } from "@/lib/pi-messages";

export function PhoneChat() {
  const [history, setHistory] = useState<PiMessagesState>(defaultPiMessagesState);
  const [recipient, setRecipient] = useState<"dj" | "group">("group");
  const [presets, setPresets] = useState<MessagePresetSets>(() => validatePresetSets(null, defaultPhonePresets));
  const [editingPresets, setEditingPresets] = useState(false);
  const [presetDraft, setPresetDraft] = useState<MessagePresetSets>(presets);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const scroll = useRef<HTMLDivElement>(null);
  const { status, sendMessage } = useWebSocket((message: { type: string; data: any }) => {
    if (message.type === "pi-messages-state") setHistory(message.data);
    if (message.type === "phone-message-sent") { setDraft(""); setPending(false); setNotice("Message sent"); }
    if (message.type === "phone-message-error") { setError(message.data.message); setPending(false); }
    if (message.type === "clock-saved") setNotice(message.data?.warning || "Clock synchronized with this phone");
    if (message.type === "clock-error") setError(message.data.message);
  });

  useEffect(() => {
    try { const saved = localStorage.getItem(PHONE_PRESETS_STORAGE_KEY); if (saved) setPresets(validatePresetSets(JSON.parse(saved), defaultPhonePresets)); }
    catch { setError("Could not load saved messages on this phone. Starter messages are available."); }
  }, []);
  useEffect(() => {
    if (status !== "connected") { setPending(false); return; }
    sendMessage({ type: "get-pi-messages" });
    sendMessage({ type: "set-clock", data: { timestamp: Date.now(), source: "phone" } });
  }, [status, sendMessage]);
  useEffect(() => {
    scroll.current?.scrollTo?.({ top: scroll.current.scrollHeight });
  }, [history.history[history.history.length - 1]?.id]);
  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => { setPending(false); setError("No send confirmation received. Check the conversation before retrying."); }, 10000);
    return () => clearTimeout(timer);
  }, [pending]);

  return <main className="mx-auto flex h-[100dvh] max-w-2xl flex-col gap-3 bg-gray-950 p-4 text-white">
    <header className="flex items-center justify-between gap-2">
      <h1 className="text-xl font-semibold">Light Assistant chat</h1>
      <span role="status" className={status === "connected" ? "text-green-400" : "text-red-300"}>{status === "connected" ? "Connected" : "Connecting…"}</span>
    </header>
    <button type="button" disabled={status !== "connected"} onClick={() => {
      setNotice(""); setError("");
      sendMessage({ type: "set-clock", data: { timestamp: Date.now(), source: "phone" } });
    }} className="self-start rounded border border-gray-600 px-3 py-2 text-sm disabled:opacity-50">Sync clock with phone</button>
    <div ref={scroll} className="min-h-0 flex-1 space-y-3 overflow-y-auto" aria-label="Conversation">
      {!history.history.length && <p className="text-gray-400">No messages yet</p>}
      {history.history.map(item => <article key={item.id} className={`max-w-[90%] rounded-lg p-3 ${item.sender === "phone" ? "ml-auto bg-blue-900" : "bg-gray-800"}`}>
        <p className="break-words whitespace-pre-wrap">{item.text}</p>
        <p className="mt-1 text-xs text-gray-300">{item.sender === "phone" ? "Phone" : item.sender === "dj" ? "DJ" : item.direction === "sent" ? "Technician" : "Received"}{item.recipient ? ` → ${messageRecipientLabel(item.recipient)}` : ""} · <time dateTime={item.timestamp}>{new Date(item.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></p>
      </article>)}
    </div>
    {notice && <p role="status" className="text-sm text-green-400">{notice}</p>}
    {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
    {editingPresets && <section className="shrink-0 rounded-lg border border-gray-600 p-3" aria-label="Edit phone saved messages">
      <p className="mb-2 text-sm">Saved messages to {recipient === "dj" ? "DJ display" : "group chat"} · this phone only</p>
      <div className="grid grid-cols-2 gap-2">{presetDraft[recipient].map((text, index) => <input key={index} aria-label={`Saved message ${index + 1}`} maxLength={160} value={text} placeholder="Empty slot" onChange={event => setPresetDraft(previous => ({ ...previous, [recipient]: previous[recipient].map((item, i) => i === index ? event.target.value : item) }))} className="min-w-0 rounded border border-gray-600 bg-gray-900 p-2 text-sm" />)}</div>
      <div className="mt-3 flex gap-2"><button type="button" onClick={() => {
        const next = validatePresetSets(presetDraft, defaultPhonePresets);
        try { localStorage.setItem(PHONE_PRESETS_STORAGE_KEY, JSON.stringify(next)); setPresets(next); setEditingPresets(false); setNotice("Saved on this phone"); setError(""); }
        catch { setError("Could not save messages on this phone. Your edits are still here."); }
      }} className="rounded bg-blue-600 px-3 py-2">Save on this phone</button><button type="button" onClick={() => setEditingPresets(false)} className="rounded border border-gray-600 px-3 py-2">Cancel</button></div>
    </section>}
    <form className="flex flex-col gap-2 pb-[env(safe-area-inset-bottom)]" onSubmit={event => {
      event.preventDefault();
      if (status !== "connected" || pending || !draft.trim()) return;
      setError(""); setNotice(""); setPending(true);
      sendMessage({ type: "send-phone-message", data: { text: draft.trim(), recipient } });
    }}>
      <fieldset disabled={pending} className="flex gap-2"><legend className="mb-1 text-sm text-gray-400">Send to</legend>
        {(["group", "dj"] as const).map(value => <label key={value} className={`flex flex-1 items-center justify-center gap-2 rounded border p-3 ${recipient === value ? "border-blue-400 bg-blue-950" : "border-gray-600"}`}>
          <input type="radio" name="recipient" value={value} checked={recipient === value} onChange={() => { setRecipient(value); setEditingPresets(false); }} />{value === "dj" ? "DJ display" : "Group chat"}
        </label>)}
      </fieldset>
      {!editingPresets && <section aria-label="Phone saved messages"><div className="mb-2 flex items-center justify-between"><span className="text-xs text-gray-400">Saved on this phone · tap to compose</span><button type="button" onClick={() => { setPresetDraft(validatePresetSets(presets, defaultPhonePresets)); setEditingPresets(true); }} className="rounded border border-gray-600 px-3 py-2 text-xs">Edit saved messages</button></div>
        <div className="grid grid-cols-2 gap-2">{presets[recipient].map((text, index) => <button key={index} type="button" disabled={!text || pending} onClick={() => setDraft(text)} className="min-h-10 rounded border border-gray-600 bg-gray-900 p-2 text-sm disabled:opacity-40">{text || "[empty]"}</button>)}</div>
      </section>}
      <p className="text-xs text-gray-400">All mobile remotes share this history. Only messages addressed to DJ display are sent to the DJ display.</p>
      <div className="flex gap-2">
        <textarea aria-label="Message" maxLength={160} value={draft} disabled={pending} onChange={event => setDraft(event.target.value)} className="h-20 min-w-0 flex-1 resize-none rounded border border-gray-600 bg-gray-900 p-2" placeholder="Type a message…" />
        <button type="submit" disabled={status !== "connected" || pending || !draft.trim()} className="rounded bg-blue-600 px-4 font-semibold disabled:opacity-50">{pending ? "Sending…" : "Send"}</button>
      </div>
    </form>
  </main>;
}

export default function Phone() { return <WebSocketProvider><PhoneChat /></WebSocketProvider>; }
