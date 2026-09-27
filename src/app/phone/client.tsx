"use client";

import React, { useEffect, useRef, useState } from "react";
import { WebSocketProvider } from "@/contexts/WebSocketContext";
import { useWebSocket } from "@/hooks/useWebSocket";
import { defaultPiMessagesState, type PiMessagesState } from "@/lib/pi-messages";

export function PhoneChat() {
  const [history, setHistory] = useState<PiMessagesState>(defaultPiMessagesState);
  const [recipient, setRecipient] = useState<"dj" | "technician">("technician");
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
        <p className="mt-1 text-xs text-gray-300">{item.sender === "phone" ? "Phone" : item.sender === "dj" ? "DJ" : item.direction === "sent" ? "Technician" : "Received"}{item.recipient ? ` → ${item.recipient === "dj" ? "DJ" : "Technician"}` : ""} · <time dateTime={item.timestamp}>{new Date(item.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></p>
      </article>)}
    </div>
    {notice && <p role="status" className="text-sm text-green-400">{notice}</p>}
    {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
    <form className="flex flex-col gap-2 pb-[env(safe-area-inset-bottom)]" onSubmit={event => {
      event.preventDefault();
      if (status !== "connected" || pending || !draft.trim()) return;
      setError(""); setNotice(""); setPending(true);
      sendMessage({ type: "send-phone-message", data: { text: draft.trim(), recipient } });
    }}>
      <fieldset disabled={pending} className="flex gap-2"><legend className="mb-1 text-sm text-gray-400">Send to</legend>
        {(["technician", "dj"] as const).map(value => <label key={value} className={`flex flex-1 items-center justify-center gap-2 rounded border p-3 ${recipient === value ? "border-blue-400 bg-blue-950" : "border-gray-600"}`}>
          <input type="radio" name="recipient" value={value} checked={recipient === value} onChange={() => setRecipient(value)} />{value === "dj" ? "DJ" : "Technician"}
        </label>)}
      </fieldset>
      <p className="text-xs text-gray-400">The technician sees all messages. DJ receives only messages addressed to DJ.</p>
      <div className="flex gap-2">
        <textarea aria-label="Message" maxLength={160} value={draft} disabled={pending} onChange={event => setDraft(event.target.value)} className="h-20 min-w-0 flex-1 resize-none rounded border border-gray-600 bg-gray-900 p-2" placeholder="Type a message…" />
        <button type="submit" disabled={status !== "connected" || pending || !draft.trim()} className="rounded bg-blue-600 px-4 font-semibold disabled:opacity-50">{pending ? "Sending…" : "Send"}</button>
      </div>
    </form>
  </main>;
}

export default function Phone() { return <WebSocketProvider><PhoneChat /></WebSocketProvider>; }
