"use client";

import { useEffect, useRef, useState } from "react";
import { useSystemClock } from "@/hooks/useSystemClock";
import { useWebSocket } from "@/hooks/useWebSocket";

function localInput(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

const dateFields = ["Year", "Month", "Day", "Hour", "Minute", "Second"] as const;

export function adjustDateTime(draft: string, field: number, direction: number): string {
  const values = draft.split(/[-T:]/).map(Number);
  const limits = [[2020, 2099], [1, 12], [1, new Date(values[0], values[1], 0).getDate()], [0, 23], [0, 59], [0, 59]];
  const [min, max] = limits[field];
  const next = values[field] + direction;
  values[field] = field === 0 ? Math.max(min, Math.min(max, next)) : next > max ? min : next < min ? max : next;
  values[2] = Math.min(values[2], new Date(values[0], values[1], 0).getDate());
  const [year, month, day, hour, minute, second] = values.map(value => String(value).padStart(2, "0"));
  return `${year}-${month}-${day}T${hour}:${minute}:${second}`;
}

export function DateTimeSettings() {
  const { time, timeZone, status } = useSystemClock();
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const initialized = useRef(false);
  const { sendMessage } = useWebSocket((message: { type: string; data: any }) => {
    if (message.type === "clock-saved") { setPending(false); setNotice(message.data?.warning || "Saved. Clock is running from the selected time."); }
    if (message.type === "clock-error") { setPending(false); setError(message.data.message); }
  });
  useEffect(() => {
    if (time && !initialized.current) { initialized.current = true; setDraft(localInput(time)); }
  }, [time]);
  useEffect(() => {
    if (status !== "connected") setPending(false);
  }, [status]);
  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => { setPending(false); setError("No clock confirmation received. Check the current clock before retrying."); }, 35000);
    return () => clearTimeout(timer);
  }, [pending]);

  return <section className="space-y-2 text-sm text-white" aria-label="Date and time settings">
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="text-gray-400">Date and time ({Intl.DateTimeFormat().resolvedOptions().timeZone})</span>
      <p className="text-right" title={timeZone}>Current system time: <strong>{time?.toLocaleString([], { timeZone }) || "Waiting for clock…"}</strong></p>
    </div>
    <form className="flex items-end gap-2" onSubmit={event => {
      event.preventDefault();
      const timestamp = new Date(draft).getTime();
      if (!Number.isFinite(timestamp) || localInput(new Date(timestamp)) !== draft) { setError("This local time does not exist. Choose another time."); return; }
      setError(""); setNotice(""); setPending(true);
      sendMessage({ type: "set-clock", data: { timestamp, source: "manual" } });
    }}>
      <fieldset disabled={pending || !draft} className="min-w-0 flex-1">
        <legend className="sr-only">Date and time</legend>
        <div className="grid grid-cols-6 gap-1">
          {dateFields.map((field, index) => <div key={field} className={`flex min-w-0 flex-col items-stretch text-center ${field === "Hour" ? "ml-2" : ""}`}>
            <span className="text-xs text-gray-400">{field}</span>
            <button type="button" aria-label={`Increase ${field.toLowerCase()}`} onClick={() => { setDraft(value => adjustDateTime(value, index, 1)); setNotice(""); }} className="h-10 rounded border border-gray-600 bg-gray-800 text-lg disabled:opacity-50">+</button>
            <output aria-label={field} className="py-1 font-mono text-base">{draft ? draft.split(/[-T:]/)[index] : "—"}</output>
            <button type="button" aria-label={`Decrease ${field.toLowerCase()}`} onClick={() => { setDraft(value => adjustDateTime(value, index, -1)); setNotice(""); }} className="h-10 rounded border border-gray-600 bg-gray-800 text-lg disabled:opacity-50">−</button>
          </div>)}
        </div>
      </fieldset>
      <button type="submit" disabled={status !== "connected" || pending || !draft} className="rounded bg-blue-600 px-4 py-2 disabled:opacity-50">{pending ? "Saving…" : "Save"}</button>
    </form>
    {notice && <p role="status" className="text-green-400">{notice}</p>}
    {error && <p role="alert" className="text-red-300">{error}</p>}
  </section>;
}
